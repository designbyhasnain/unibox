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

    const placesKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!placesKey) {
        result.status = 'no_api_key';
        result.errors.push('GOOGLE_PLACES_API_KEY not set');
        return result;
    }

    const placesCap = parseInt(process.env.LOOKALIKE_DAILY_PLACES_CAP || '200', 10);
    const igCap = parseInt(process.env.LOOKALIKE_DAILY_IG_CAP || '500', 10);
    const today = new Date().toISOString().slice(0, 10);     // YYYY-MM-DD UTC
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    // Pre-flight: check the daily caps so we don't run a single query
    // and discover we're broke mid-run. (Atomicity below still
    // enforces per-call.)
    const placesUsed = await getApiUsageToday('google_places', today);
    if (placesUsed >= placesCap) {
        result.status = 'cap_reached';
        result.resumesAt = tomorrow.toISOString();
        result.errors.push(`google_places daily cap (${placesCap}) reached`);
        return result;
    }

    const maxPerQuery = opts.maxPerQuery ?? 20;
    const sourceTag = opts.sourceTag ?? 'lookalike_google';

    for (const q of queries) {
        if (opts.dryRun) {
            result.queriesRun++;
            continue;
        }

        // Cap check per-query so we abort early if we hit it mid-run.
        const currentUsed = await getApiUsageToday('google_places', today);
        if (currentUsed >= placesCap) {
            result.status = 'cap_reached';
            result.resumesAt = tomorrow.toISOString();
            break;
        }

        let listings: PlacesListing[] = [];
        try {
            listings = await searchGooglePlaces(q.text, placesKey, maxPerQuery);
            await bumpApiUsage('google_places', today, 1);
            result.placesCallsUsed++;
        } catch (err: any) {
            result.errors.push(`places "${q.text}": ${err?.message || err}`);
            continue;
        }
        result.placesFound += listings.length;
        result.queriesRun++;

        for (const listing of listings) {
            // Instagram ghost-account filter — best-effort. If we don't
            // have a RAPIDAPI_KEY or the listing has no IG handle, skip
            // the filter (still ingest). When we DO filter, ghost
            // accounts get dropped before we waste an upsert.
            let igMeta: InstagramMeta | null = null;
            const igHandle = extractInstagramHandle(listing);
            if (igHandle && process.env.RAPIDAPI_KEY) {
                const igUsedNow = await getApiUsageToday('rapidapi_instagram', today);
                if (igUsedNow < igCap) {
                    try {
                        igMeta = await fetchInstagramProfile(igHandle, process.env.RAPIDAPI_KEY);
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

async function getApiUsageToday(api: 'google_places' | 'rapidapi_instagram', day: string): Promise<number> {
    const { data } = await supabase
        .from('external_api_usage')
        .select('calls_used')
        .eq('api', api)
        .eq('day', day)
        .maybeSingle();
    return (data?.calls_used as number | undefined) ?? 0;
}

async function bumpApiUsage(api: 'google_places' | 'rapidapi_instagram', day: string, delta: number): Promise<void> {
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
