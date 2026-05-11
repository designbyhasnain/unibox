import 'server-only';
import { supabase } from '../lib/supabase';
import { getTopClients } from './jarvisService';
import { scrapeUrl } from './leadScraperService';

/**
 * Phase-C ambient lead supply: lookalike sourcing from Google Places +
 * Instagram filter.
 *
 * Two triggers (one engine):
 *   - On-demand: rep clicks "Top up <region>" in Goal Planner → sourceLeads()
 *   - Cron: nightly /api/cron/top-up-pool walks active goals, refills
 *     regions with untouched < THRESHOLD.
 *
 * Cost guardrails: every external API call decrements a daily budget in
 * external_api_usage. When the day's cap is reached, sourceLeads() bails
 * gracefully with `{ status: 'cap_reached' }` — never silently overspends.
 *
 * v1 scope intentionally narrow:
 *   - Lookalike key: top-paid clients' regions + a single project label.
 *   - Sources: Google Places (search) + RapidAPI Instagram (filter only).
 *   - Email harvest: Places listing first, fall back to scrapeUrl() on
 *     the website if Places didn't return an email.
 *   - Dedupe: email (primary) + place_id (secondary unique index).
 *
 * v2 / out-of-scope: Apollo enrichment, LinkedIn scraping, lookalike
 * score training, per-rep keys, approval queue.
 */

// ─── Public types ──────────────────────────────────────────────────────────

export type LookalikeQuery = {
    text: string;               // "wedding videographer San Diego"
    region: string;             // "San Diego" / "California" / etc — for tagging
    derivedFrom?: string;       // "top-paid lookalike" | "manual"
};

export type SourceLeadsResult = {
    status: 'ok' | 'cap_reached' | 'no_api_key' | 'error';
    queriesRun: number;
    placesFound: number;
    instagramRejected: number;
    contactsAdded: number;
    contactsSkipped: number;
    errors: string[];
    placesCallsUsed: number;
    instagramCallsUsed: number;
    resumesAt?: string;         // ISO UTC midnight when caps reset
};

export type SourceOptions = {
    /**
     * The owning user (account_manager_id) for inserted contacts. The
     * Goal Planner trigger passes the rep's id; the cron passes the
     * goal owner's id.
     */
    ownerUserId: string;
    /** Label written to contacts.source. Defaults to 'lookalike_google'. */
    sourceTag?: string;
    /** Per-query result cap to bound spend. Default 20 (max Places page). */
    maxPerQuery?: number;
    /** Dry run — no external calls, no DB writes. Used by cron --dry. */
    dryRun?: boolean;
};

// ─── Public entry points ───────────────────────────────────────────────────

/**
 * Build N lookalike queries from the top-paid clients. v1 reads top 100
 * by total_revenue, extracts unique regions from `location` (free-text),
 * and prefixes each with a fixed project label. Future versions can
 * expand to project_type × region combinatorics.
 */
export async function deriveLookalikeQueries(limit = 8): Promise<LookalikeQuery[]> {
    const top = await getTopClients(100);
    if (!top.length) return [];

    // Extract unique regions, ranked by total_revenue rolled up. Locations
    // in the contacts table are free-text ("San Diego, CA, USA",
    // "London, UK", "São Paulo, Brazil" …) — split on commas, take the
    // first piece, normalise whitespace.
    const regionRevenue = new Map<string, number>();
    for (const c of top) {
        const loc = (c.location as string | null) || '';
        const region = loc.split(',')[0]?.trim();
        if (!region) continue;
        regionRevenue.set(region, (regionRevenue.get(region) ?? 0) + Number(c.total_revenue ?? 0));
    }
    const ranked = [...regionRevenue.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([region]) => region);

    // v1 prefix — wedding videographer is the canonical query. Variants
    // come from regions only. Reps can edit the modal pre-launch.
    const queries: LookalikeQuery[] = ranked.slice(0, limit).map(region => ({
        text: `wedding videographer ${region}`,
        region,
        derivedFrom: 'top-paid lookalike',
    }));

    return queries;
}

/**
 * The engine. Runs N queries through Google Places, optionally filters
 * via Instagram, upserts into contacts, returns a summary. Respects
 * per-day caps from external_api_usage.
 */
export async function sourceLeads(
    queries: LookalikeQuery[],
    opts: SourceOptions,
): Promise<SourceLeadsResult> {
    const result: SourceLeadsResult = {
        status: 'ok',
        queriesRun: 0,
        placesFound: 0,
        instagramRejected: 0,
        contactsAdded: 0,
        contactsSkipped: 0,
        errors: [],
        placesCallsUsed: 0,
        instagramCallsUsed: 0,
    };

    // Multi-source: enable any source whose key is set. OSM has no key
    // requirement so it's always on — that's the "never run out of leads
    // even without paid APIs" baseline. Google Places stays primary when
    // configured (best quality), Foursquare / HERE / SerpAPI add coverage.
    const sourceCfg = {
        google_places: !!process.env.GOOGLE_PLACES_API_KEY,
        osm: true,
        foursquare: !!process.env.FOURSQUARE_API_KEY,
        here: !!process.env.HERE_API_KEY,
        serpapi: !!process.env.SERPAPI_KEY,
    };
    const enabledSources = Object.entries(sourceCfg).filter(([, v]) => v).map(([k]) => k);
    if (enabledSources.length === 0) {
        result.status = 'no_api_key';
        result.errors.push('No lead sources configured (this should not happen — OSM has no key)');
        return result;
    }

    const placesCap = parseInt(process.env.LOOKALIKE_DAILY_PLACES_CAP || '200', 10);
    const igCap = parseInt(process.env.LOOKALIKE_DAILY_IG_CAP || '500', 10);
    const fsqCap = parseInt(process.env.LOOKALIKE_DAILY_FOURSQUARE_CAP || '1500', 10);
    const hereCap = parseInt(process.env.LOOKALIKE_DAILY_HERE_CAP || '1000', 10);
    const serpCap = parseInt(process.env.LOOKALIKE_DAILY_SERPAPI_CAP || '3', 10);
    const today = new Date().toISOString().slice(0, 10);     // YYYY-MM-DD UTC
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    const maxPerQuery = opts.maxPerQuery ?? 20;
    const sourceTag = opts.sourceTag ?? 'lookalike_google';

    for (const q of queries) {
        if (opts.dryRun) {
            result.queriesRun++;
            continue;
        }

        // Fan out to every configured source in parallel. Each source
        // enforces its own daily cap; if a source hits its cap it returns
        // an empty array and a `cap_reached` flag in the wrapper. The
        // orchestrator keeps going with whatever sources are still under.
        const sourceCalls: Array<{ name: string; promise: Promise<PlacesListing[]> }> = [];

        if (sourceCfg.google_places) {
            const used = await getApiUsageToday('google_places', today);
            if (used < placesCap) {
                sourceCalls.push({
                    name: 'google_places',
                    promise: searchGooglePlaces(q.text, process.env.GOOGLE_PLACES_API_KEY!, maxPerQuery)
                        .then(async (rows) => { await bumpApiUsage('google_places', today, 1); result.placesCallsUsed++; return rows; })
                        .catch((err: any) => { result.errors.push(`places "${q.text}": ${err?.message || err}`); return []; }),
                });
            }
        }
        if (sourceCfg.osm) {
            sourceCalls.push({
                name: 'osm',
                promise: searchOSM(q.text, maxPerQuery)
                    .catch((err: any) => { result.errors.push(`osm "${q.text}": ${err?.message || err}`); return []; }),
            });
        }
        if (sourceCfg.foursquare) {
            const used = await getApiUsageToday('foursquare', today);
            if (used < fsqCap) {
                sourceCalls.push({
                    name: 'foursquare',
                    promise: searchFoursquare(q.text, process.env.FOURSQUARE_API_KEY!, maxPerQuery)
                        .then(async (rows) => { await bumpApiUsage('foursquare', today, 1); return rows; })
                        .catch((err: any) => { result.errors.push(`fsq "${q.text}": ${err?.message || err}`); return []; }),
                });
            }
        }
        if (sourceCfg.here) {
            const used = await getApiUsageToday('here', today);
            if (used < hereCap) {
                sourceCalls.push({
                    name: 'here',
                    promise: searchHere(q.text, process.env.HERE_API_KEY!, maxPerQuery)
                        .then(async (rows) => { await bumpApiUsage('here', today, 1); return rows; })
                        .catch((err: any) => { result.errors.push(`here "${q.text}": ${err?.message || err}`); return []; }),
                });
            }
        }
        if (sourceCfg.serpapi) {
            const used = await getApiUsageToday('serpapi', today);
            if (used < serpCap) {
                sourceCalls.push({
                    name: 'serpapi',
                    promise: searchSerpApi(q.text, process.env.SERPAPI_KEY!, maxPerQuery)
                        .then(async (rows) => { await bumpApiUsage('serpapi', today, 1); return rows; })
                        .catch((err: any) => { result.errors.push(`serpapi "${q.text}": ${err?.message || err}`); return []; }),
                });
            }
        }

        if (sourceCalls.length === 0) {
            result.status = 'cap_reached';
            result.resumesAt = tomorrow.toISOString();
            break;
        }

        const sourceRows = await Promise.all(sourceCalls.map(s => s.promise));
        const unioned: PlacesListing[] = sourceRows.flat();
        const listings = dedupePlacesListings(unioned);
        result.placesFound += listings.length;
        result.queriesRun++;

        for (const listing of listings) {
            // Instagram ghost-account filter — best-effort. If we don't
            // have a RAPIDAPI_KEY or the listing has no IG handle, skip
            // the filter (still ingest). When we DO filter, ghost
            // accounts get dropped before we waste an upsert.
            let igMeta: InstagramMeta | null = null;
            const igHandle = extractInstagramHandle(listing);
            if (igHandle && (process.env.RAPIDAPI_INSTAGRAM_KEY || process.env.RAPIDAPI_KEY)) {
                const igUsedNow = await getApiUsageToday('rapidapi_instagram', today);
                if (igUsedNow < igCap) {
                    try {
                        igMeta = await fetchInstagramProfile(igHandle, (process.env.RAPIDAPI_INSTAGRAM_KEY || process.env.RAPIDAPI_KEY)!);
                        await bumpApiUsage('rapidapi_instagram', today, 1);
                        result.instagramCallsUsed++;
                    } catch (err: any) {
                        // IG failures are non-fatal — log + ingest the
                        // lead anyway.
                        result.errors.push(`ig "${igHandle}": ${(err?.message || err).slice(0, 80)}`);
                    }
                }
                if (igMeta && isGhostAccount(igMeta)) {
                    result.instagramRejected++;
                    continue;
                }
            }

            // Email harvest fallback — Places often returns websites
            // but no email. Scrape the website (existing leafer)
            // before deciding the contact is unusable.
            let email = listing.email ?? null;
            if (!email && listing.website) {
                try {
                    const scraped = await scrapeUrl(listing.website);
                    email = scraped.email;
                } catch { /* website unreachable — leave email null */ }
            }

            // No email AND no place_id → nothing to dedupe on, skip.
            if (!email && !listing.placeId) {
                result.contactsSkipped++;
                continue;
            }

            const upsert = await upsertContact({
                email,
                listing,
                instagram: igMeta,
                ownerUserId: opts.ownerUserId,
                sourceTag,
                sourceQuery: q.text,
                lookalikeScore: computeLookalikeScore(listing, q),
            });
            if (upsert === 'inserted') result.contactsAdded++;
            else result.contactsSkipped++;
        }
    }

    return result;
}

// ─── Google Places ─────────────────────────────────────────────────────────

type PlacesListing = {
    placeId: string;
    name: string | null;
    address: string | null;
    region: string | null;
    website: string | null;
    phone: string | null;
    email: string | null;
    rating: number | null;
    userRatingsTotal: number | null;
};

async function searchGooglePlaces(query: string, apiKey: string, maxResults: number): Promise<PlacesListing[]> {
    // New Places API v1 — Text Search. Field mask is required and keeps
    // the response (and per-call cost) lean. We only ask for the fields
    // we actually use.
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.internationalPhoneNumber,places.rating,places.userRatingCount',
        },
        body: JSON.stringify({
            textQuery: query,
            maxResultCount: Math.min(maxResults, 20),
        }),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`places ${res.status}: ${body.slice(0, 120)}`);
    }
    const json: any = await res.json();
    const places = Array.isArray(json?.places) ? json.places : [];
    return places.map((p: any): PlacesListing => ({
        placeId: p.id,
        name: p.displayName?.text ?? null,
        address: p.formattedAddress ?? null,
        region: extractRegionFromAddress(p.formattedAddress ?? null),
        website: p.websiteUri ?? null,
        phone: p.internationalPhoneNumber ?? null,
        email: null,                                  // Places never returns email
        rating: typeof p.rating === 'number' ? p.rating : null,
        userRatingsTotal: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
    }));
}

function extractRegionFromAddress(addr: string | null): string | null {
    if (!addr) return null;
    // Free-text formatted address — "1234 Main St, San Diego, CA 92101,
    // USA". The middle pieces are usually city / state. Take first
    // comma-piece that isn't a numeric street fragment.
    const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
    return parts.find(p => !/^\d/.test(p)) ?? parts[0] ?? null;
}

// ─── Instagram ─────────────────────────────────────────────────────────────

type InstagramMeta = {
    username: string;
    followers: number | null;
    lastPostAt: string | null;       // ISO
};

function extractInstagramHandle(listing: PlacesListing): string | null {
    // Places doesn't return social handles directly. v1 only matches if
    // the website itself contains an instagram link in its name or
    // we've already scraped it via scrapeUrl (which captures
    // social.instagram). For pure-Places listings we'll skip the IG
    // filter entirely — accepting all of them — until the website
    // scraper has run for that contact. This is a deliberate v1
    // trade-off; v2 can run scrapeUrl() inline before the IG check.
    if (!listing.website) return null;
    // Heuristic: if the displayed name looks like "@handle", use it.
    const m = listing.name?.match(/@([a-z0-9._]+)/i);
    return m?.[1] ?? null;
}

async function fetchInstagramProfile(username: string, rapidKey: string): Promise<InstagramMeta | null> {
    // Generic Instagram-scraper-API shape — easy to swap if RapidAPI
    // marketplace rotates the endpoint. Returns null silently on any
    // error; the caller treats null as "couldn't verify, accept anyway".
    const res = await fetch(`https://instagram-scraper-api2.p.rapidapi.com/v1/info?username_or_id_or_url=${encodeURIComponent(username)}`, {
        headers: {
            'X-RapidAPI-Key': rapidKey,
            'X-RapidAPI-Host': 'instagram-scraper-api2.p.rapidapi.com',
        },
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    if (!json) return null;
    const data = json.data ?? json;
    const followers = typeof data.follower_count === 'number'
        ? data.follower_count
        : typeof data.followers_count === 'number' ? data.followers_count : null;
    const lastPost = data.last_post_timestamp || data.latest_post_at || null;
    return {
        username,
        followers,
        lastPostAt: lastPost ? new Date(lastPost).toISOString() : null,
    };
}

function isGhostAccount(meta: InstagramMeta): boolean {
    // v1 ghost rules — kill accounts that look inactive or vanity:
    //   • <100 followers   (likely fake / never reached scale)
    //   • last post > 90d  (account abandoned)
    // Strict — false positives are cheap (we skip a lead); false negatives
    // (ghost slipping through) cost ~$0.001 per send.
    if (meta.followers !== null && meta.followers < 100) return true;
    if (meta.lastPostAt) {
        const days = (Date.now() - Date.parse(meta.lastPostAt)) / 86_400_000;
        if (days > 90) return true;
    }
    return false;
}

// ─── Lookalike score (v1: simple region match) ─────────────────────────────

function computeLookalikeScore(listing: PlacesListing, q: LookalikeQuery): number {
    // v1 — naive: 0.7 baseline + 0.2 for region match + 0.1 for verified
    // listing (rating + reviews). Caps at 0.99. v2 trains on engagement
    // signals from converted clients.
    let score = 0.7;
    if (listing.region?.toLowerCase().includes(q.region.toLowerCase())) score += 0.2;
    if (listing.rating && listing.userRatingsTotal && listing.userRatingsTotal > 5) score += 0.1;
    return Math.min(0.99, Math.round(score * 100) / 100);
}

// ─── Upsert ────────────────────────────────────────────────────────────────

type UpsertResult = 'inserted' | 'duplicate' | 'failed';

async function upsertContact(args: {
    email: string | null;
    listing: PlacesListing;
    instagram: InstagramMeta | null;
    ownerUserId: string;
    sourceTag: string;
    sourceQuery: string;
    lookalikeScore: number;
}): Promise<UpsertResult> {
    // Dedupe pass 1 — email (primary).
    if (args.email) {
        const { data: existingByEmail } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', args.email)
            .maybeSingle();
        if (existingByEmail) return 'duplicate';
    }
    // Dedupe pass 2 — place_id (secondary, the new unique index catches
    // races but checking up front saves an INSERT round-trip).
    const { data: existingByPlace } = await supabase
        .from('contacts')
        .select('id')
        .eq('place_id', args.listing.placeId)
        .maybeSingle();
    if (existingByPlace) return 'duplicate';

    const row = {
        name: args.listing.name,
        email: args.email,
        phone: args.listing.phone,
        location: args.listing.address,
        place_id: args.listing.placeId,
        pipeline_stage: 'COLD_LEAD',
        account_manager_id: args.ownerUserId,
        source: args.sourceTag,
        source_query: args.sourceQuery,
        lookalike_score: args.lookalikeScore,
        instagram_username: args.instagram?.username ?? null,
        instagram_followers: args.instagram?.followers ?? null,
        last_instagram_post_at: args.instagram?.lastPostAt ?? null,
        lead_score: Math.round(args.lookalikeScore * 100),
    };

    const { error } = await supabase.from('contacts').insert([row]);
    if (error) {
        // Unique violation on place_id race → duplicate, not failure.
        if (error.code === '23505') return 'duplicate';
        return 'failed';
    }
    return 'inserted';
}

// ─── Daily-cap bookkeeping ─────────────────────────────────────────────────

type ApiName = 'google_places' | 'rapidapi_instagram' | 'osm' | 'foursquare' | 'here' | 'serpapi';

async function getApiUsageToday(api: ApiName, day: string): Promise<number> {
    const { data } = await supabase
        .from('external_api_usage')
        .select('calls_used')
        .eq('api', api)
        .eq('day', day)
        .maybeSingle();
    return (data?.calls_used as number | undefined) ?? 0;
}

async function bumpApiUsage(api: ApiName, day: string, delta: number): Promise<void> {
    // Upsert with arithmetic — PostgREST doesn't support `+= 1`
    // directly, so read-modify-write is the simplest path. Races are
    // possible but the cap is a soft cap (10-15 over the limit is
    // acceptable for v1).
    const current = await getApiUsageToday(api, day);
    await supabase
        .from('external_api_usage')
        .upsert(
            [{ api, day, calls_used: current + delta, last_updated_at: new Date().toISOString() }],
            { onConflict: 'api,day' },
        );
}

// ─── OpenStreetMap via Overpass ────────────────────────────────────────────
// Free, no key. Quality is patchier than Google but coverage is global.
async function searchOSM(query: string, maxResults: number): Promise<PlacesListing[]> {
    const tokens = query.split(/\s+/);
    const area = tokens.slice(-2).join(' '); // "San Diego" out of "wedding videographer San Diego"
    const trade = tokens.slice(0, -2).join(' ').toLowerCase();
    if (!area || !trade) return [];
    const tradePattern = trade.split(' ').filter(Boolean).join('|');
    const ql = `
        [out:json][timeout:25];
        area["name"="${area.replace(/"/g, '')}"]->.a;
        (
          node["name"~"${tradePattern}", i](area.a);
          way["name"~"${tradePattern}", i](area.a);
        );
        out tags center ${maxResults};
    `;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: ql,
    });
    if (!res.ok) return [];
    const json: any = await res.json().catch(() => ({}));
    const elements: any[] = Array.isArray(json?.elements) ? json.elements : [];
    return elements.slice(0, maxResults).map((e: any): PlacesListing => {
        const t = e?.tags || {};
        return {
            placeId: `osm_${e.type}_${e.id}`,
            name: t.name ?? null,
            address: [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(', ') || null,
            region: t['addr:city'] ?? t['addr:state'] ?? null,
            website: t.website || t['contact:website'] || null,
            phone: t.phone || t['contact:phone'] || null,
            email: t.email || t['contact:email'] || null,
            rating: null,
            userRatingsTotal: null,
        };
    });
}

// ─── Foursquare Places API (50k/mo free tier) ──────────────────────────────
async function searchFoursquare(query: string, apiKey: string, maxResults: number): Promise<PlacesListing[]> {
    const url = `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(query)}&limit=${Math.min(maxResults, 50)}`;
    const res = await fetch(url, { headers: { Authorization: apiKey, accept: 'application/json' } });
    if (!res.ok) throw new Error(`foursquare ${res.status}`);
    const json: any = await res.json().catch(() => ({}));
    const places: any[] = Array.isArray(json?.results) ? json.results : [];
    return places.map((p: any): PlacesListing => ({
        placeId: `fsq_${p?.fsq_id}`,
        name: p?.name ?? null,
        address: p?.location?.formatted_address ?? null,
        region: p?.location?.locality ?? p?.location?.region ?? null,
        website: p?.website ?? null,
        phone: p?.tel ?? null,
        email: null,
        rating: null,
        userRatingsTotal: null,
    }));
}

// ─── HERE Maps Places (1k/day free tier) ───────────────────────────────────
async function searchHere(query: string, apiKey: string, maxResults: number): Promise<PlacesListing[]> {
    // HERE Discover requires an 'at' anchor — use 0,0 to make the text the
    // dominant signal. Free-text queries with location names work fine.
    const url = `https://discover.search.hereapi.com/v1/discover?q=${encodeURIComponent(query)}&at=0,0&limit=${Math.min(maxResults, 100)}&apiKey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`here ${res.status}`);
    const json: any = await res.json().catch(() => ({}));
    const items: any[] = Array.isArray(json?.items) ? json.items : [];
    return items.map((p: any): PlacesListing => ({
        placeId: `here_${p?.id}`,
        name: p?.title ?? null,
        address: p?.address?.label ?? null,
        region: p?.address?.city ?? p?.address?.state ?? null,
        website: p?.contacts?.[0]?.www?.[0]?.value ?? null,
        phone: p?.contacts?.[0]?.phone?.[0]?.value ?? null,
        email: p?.contacts?.[0]?.email?.[0]?.value ?? null,
        rating: null,
        userRatingsTotal: null,
    }));
}

// ─── SerpAPI Google Maps engine (100/mo free) ──────────────────────────────
async function searchSerpApi(query: string, apiKey: string, maxResults: number): Promise<PlacesListing[]> {
    const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(query)}&api_key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`serpapi ${res.status}`);
    const json: any = await res.json().catch(() => ({}));
    const places: any[] = Array.isArray(json?.local_results) ? json.local_results : [];
    return places.slice(0, maxResults).map((p: any): PlacesListing => ({
        placeId: p?.place_id ? `serp_${p.place_id}` : `serp_${Math.random().toString(36).slice(2)}`,
        name: p?.title ?? null,
        address: p?.address ?? null,
        region: p?.address ?? null,
        website: p?.website ?? null,
        phone: p?.phone ?? null,
        email: null,
        rating: typeof p?.rating === 'number' ? p.rating : null,
        userRatingsTotal: typeof p?.reviews === 'number' ? p.reviews : null,
    }));
}

// ─── Dedupe across source results ──────────────────────────────────────────
function dedupePlacesListings(rows: PlacesListing[]): PlacesListing[] {
    const seenPlace = new Set<string>();
    const seenEmail = new Set<string>();
    const seenDomain = new Set<string>();
    const seenPhone = new Set<string>();
    const out: PlacesListing[] = [];
    for (const r of rows) {
        const placeKey = r.placeId || null;
        const emailKey = r.email?.toLowerCase() || null;
        const phoneKey = r.phone?.replace(/\D+/g, '') || null;
        const domainKey = (() => {
            if (!r.website) return null;
            try { return new URL(r.website.startsWith('http') ? r.website : `https://${r.website}`).hostname.toLowerCase().replace(/^www\./, ''); }
            catch { return null; }
        })();
        if (placeKey && seenPlace.has(placeKey)) continue;
        if (emailKey && seenEmail.has(emailKey)) continue;
        if (domainKey && seenDomain.has(domainKey)) continue;
        if (phoneKey && phoneKey.length >= 7 && seenPhone.has(phoneKey)) continue;
        if (placeKey) seenPlace.add(placeKey);
        if (emailKey) seenEmail.add(emailKey);
        if (domainKey) seenDomain.add(domainKey);
        if (phoneKey && phoneKey.length >= 7) seenPhone.add(phoneKey);
        out.push(r);
    }
    return out;
}
