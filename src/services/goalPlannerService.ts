import 'server-only';
import { supabase } from '../lib/supabase';
import { getOwnerFilter } from '../utils/accessControl';

/**
 * Goal-Driven Campaign Planner — pure compute.
 *
 * Given a goal (amount + deadline) and a SALES user, produce ranked Scenario
 * cards (region, dormant re-engagement, follow-up depth, scrape-needed)
 * with funnel-decomposition revenue projections + Bayesian shrinkage so
 * cold-start regions don't hallucinate.
 *
 * No writes. The Build-Drafts step lives in goalPlannerActions and calls
 * the existing createCampaignAction — this file does not touch campaign
 * tables.
 *
 * Multi-tenant: every prompt / prior reads from `tenantNiche` (default
 * 'wedding_filmmakers' for v1). When the SaaS pivot lands, this becomes
 * a per-workspace setting.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type FunnelRates = {
    deliver: number;
    open: number;
    reply: number;
    meeting: number;
    close: number;
    avgDealSize: number;
    /** Number of historical sends used to estimate the rates. Drives confidence. */
    sampleSize: number;
};

export type ScenarioKind =
    | 'REGION_TOP'
    | 'DORMANT_REENGAGEMENT'
    | 'FOLLOWUP_DEPTH'
    | 'SCRAPE_NEEDED';

export type Scenario = {
    /** Stable ID (deterministic from kind + key) — same goal always produces same scenario IDs. */
    id: string;
    kind: ScenarioKind;
    label: string;
    /** Human-readable detail line (e.g. "380 untouched, send 20/day, until May 28"). */
    detail: string;
    /** Untouched-pool size that *could* be hit by this scenario. */
    poolMax: number;
    /** Sends actually allocated by capacity-pro-rata in computePlan(). */
    sendsAllocated: number;
    funnel: FunnelRates;
    /** sendsAllocated × funnel revenue per send. */
    projectedRevenue: number;
    confidence: Confidence;
    /** Set when actionable (e.g. "scrape 500 EU contacts"). */
    blocker: string | null;
    /** Region tag — populated for SCRAPE_NEEDED and REGION_TOP scenarios so
     *  the UI can prefill the lookalike sourcing modal. */
    region?: string;
};

export type GoalPlan = {
    goalAmount: number;
    deadline: string; // ISO
    daysUntilDeadline: number;
    dailySendCapacity: number;
    totalProjectedRevenue: number;
    scenarios: Scenario[];
    /** Goal feasibility — 'OK' / 'GAP' / 'BLOCKED' */
    feasibility: 'OK' | 'GAP' | 'BLOCKED';
    feasibilityReason: string;
};

// ─── Per-niche priors ────────────────────────────────────────────────────────
// Seeded from typical wedding-filmmaker outreach industry baselines. Replace
// with empirical measurements once we have post-launch data.
//
// Per-niche: the SaaS rollout will load this from a `niche_priors` table.

type NichePriors = {
    deliver: number;
    open: number;
    reply: number;
    meeting: number;
    close: number;
    avgDealSize: number;
};

const NICHE_PRIORS: Record<string, NichePriors> = {
    wedding_filmmakers: {
        deliver: 0.95,
        open: 0.40,
        reply: 0.08,
        meeting: 0.30,
        close: 0.20,
        avgDealSize: 400,
    },
};

const SHRINKAGE_K = 30; // weight on prior; n=30 means equal weight to data + prior
const FOLLOWUP_OPENED_NO_REPLY_LIFT = 0.25; // adding a 3rd follow-up converts ~25% of opened-no-reply

// ─── Low-budget region exclusions ────────────────────────────────────────────
// Markets where wedding-filmmaker average deal sizes are well below USD priors
// — suppressed from both Region and Scrape-Needed scenarios so the planner
// doesn't recommend pouring sends into low-ROI geographies. Tokens are
// case-insensitive and matched against the parsed top region (last comma
// segment of `contacts.location`). Add per-niche overrides when SaaS lands.
const LOW_BUDGET_REGION_TOKENS_BY_NICHE: Record<string, string[]> = {
    wedding_filmmakers: [
        // South Asia
        'pakistan', 'pk', 'india', 'in ', 'bangladesh', 'bd', 'sri lanka', 'lk',
        'nepal', 'np',
        // SE Asia (low avg deal size in our data)
        'philippines', 'ph', 'indonesia', 'id', 'vietnam', 'vn',
        // Africa
        'nigeria', 'ng', 'egypt', 'eg', 'kenya', 'ke', 'south africa', 'za',
        // LATAM mid/low (Brazil weddings often <$200)
        'brazil', 'br', 'argentina', 'ar', 'colombia', 'co',
    ],
};

/** Hard floor on avg deal size. Anything below this is filtered regardless of region. */
const MIN_AVG_DEAL_SIZE_USD = 200;

function isLowBudgetRegion(region: string, niche: string): boolean {
    const tokens = LOW_BUDGET_REGION_TOKENS_BY_NICHE[niche] ?? [];
    const r = region.trim().toLowerCase();
    return tokens.some(t => r === t.trim() || r.includes(t.trim()));
}

// ─── Stage gates ─────────────────────────────────────────────────────────────
// Hard rules: never cold-email a paying client, a closed deal, an accepted
// offer, an active lead, or someone who said NOT_INTERESTED. Filtering at the
// "untouched pool" step prevents bad enrollment AND keeps capacity allocation
// honest (sends don't get burned on people we've already converted or lost).

/** Pipeline stages that are *eligible* for fresh COLD outreach. */
const COLD_OUTREACH_STAGES = new Set<string>(['COLD_LEAD']);

/** Pipeline stages that are *eligible* for FOLLOW-UP depth boost (in-flight conversations only). */
const FOLLOWUP_DEPTH_STAGES = new Set<string>(['CONTACTED', 'WARM_LEAD', 'LEAD']);

/** Pipeline stages that are *eligible* for DORMANT re-engagement. */
const DORMANT_STAGES = new Set<string>(['CONTACTED', 'COLD_LEAD']);

/** Hard "do not contact" — applies to every scenario regardless of kind. */
function isDoNotContact(c: RawContact): boolean {
    if (c.is_client) return true;
    const stage = c.pipeline_stage ?? null;
    if (stage === 'CLOSED' || stage === 'OFFER_ACCEPTED' || stage === 'NOT_INTERESTED') return true;
    return false;
}

function isEligibleForColdOutreach(c: RawContact): boolean {
    if (isDoNotContact(c)) return false;
    // Allow null stage (never been touched) AND COLD_LEAD.
    return c.pipeline_stage == null || COLD_OUTREACH_STAGES.has(c.pipeline_stage);
}

function isEligibleForFollowupDepth(c: RawContact): boolean {
    if (isDoNotContact(c)) return false;
    return c.pipeline_stage != null && FOLLOWUP_DEPTH_STAGES.has(c.pipeline_stage);
}

function isEligibleForDormantReengagement(c: RawContact): boolean {
    if (isDoNotContact(c)) return false;
    return c.pipeline_stage != null && DORMANT_STAGES.has(c.pipeline_stage);
}

// ─── Core math ───────────────────────────────────────────────────────────────

/** Clamp to [0, 1] — guards against bad data (e.g. is_client AND stage=CLOSED double-counts). */
function clamp01(x: number): number {
    if (!Number.isFinite(x) || x < 0) return 0;
    return x > 1 ? 1 : x;
}

/** Bayesian shrinkage toward the per-niche prior. Output always clamped to [0, 1]. */
function shrink(observed: number, n: number, prior: number): number {
    const clean = clamp01(observed);
    if (n <= 0) return clamp01(prior);
    return clamp01((n * clean + SHRINKAGE_K * prior) / (n + SHRINKAGE_K));
}

/** Revenue projected per send under the funnel rates. */
export function revenuePerSend(f: FunnelRates): number {
    return f.deliver * f.open * f.reply * f.meeting * f.close * f.avgDealSize;
}

/** Confidence band from the smallest sample size in the funnel. */
function bandFromSampleSize(n: number): Confidence {
    if (n >= 100) return 'HIGH';
    if (n >= 30) return 'MEDIUM';
    return 'LOW';
}

// ─── Region helpers (extract top region from free-text location) ─────────────

/** Last comma-segment of a location string. "Los Angeles, CA" → "CA". */
export function topRegionOf(location: string | null | undefined): string {
    if (!location) return 'Unknown';
    const parts = location.split(',').map(p => p.trim()).filter(Boolean);
    return parts[parts.length - 1] || parts[0] || 'Unknown';
}

// ─── Data fetch ──────────────────────────────────────────────────────────────

type RawContact = {
    id: string;
    location: string | null;
    pipeline_stage: string | null;
    total_revenue: number | null;
    avg_project_value: number | null;
    total_projects: number | null;
    total_emails_sent: number | null;
    total_emails_received: number | null;
    days_since_last_contact: number | null;
    last_email_at: string | null;
    lead_score: number | null;
    followup_count: number | null;
    is_client: boolean | null;
};

async function fetchOwnedContacts(userId: string, role: string): Promise<RawContact[]> {
    const ownerId = getOwnerFilter(userId, role);
    let query = supabase
        .from('contacts')
        .select(
            'id, location, pipeline_stage, total_revenue, avg_project_value, total_projects, total_emails_sent, total_emails_received, days_since_last_contact, last_email_at, lead_score, followup_count, is_client'
        );
    if (ownerId) query = query.eq('account_manager_id', ownerId);

    const all: RawContact[] = [];
    let offset = 0;
    // Paginate to avoid Supabase 1000-row default cap
    while (true) {
        const { data, error } = await query.range(offset, offset + 999);
        if (error) {
            console.error('[goalPlanner] fetchOwnedContacts error:', error);
            break;
        }
        if (!data || data.length === 0) break;
        all.push(...(data as RawContact[]));
        if (data.length < 1000) break;
        offset += 1000;
    }
    return all;
}

/**
 * Sum daily-send capacity across the user's accessible active Gmail accounts.
 * SALES: only assigned accounts. ADMIN/ACCOUNT_MANAGER: all active accounts.
 *
 * The Prisma schema has `gmailAccount.dailySendLimit` but the production DB
 * has not migrated that column yet (verified 2026-05-03 — see
 * accountRotationService.ts which falls back to 500). So we apply the same
 * 500/day fallback per account, modulated by warmup state when present.
 */
async function fetchDailySendCapacity(userId: string, role: string): Promise<number> {
    const ownerId = getOwnerFilter(userId, role);
    if (ownerId) {
        // SALES: join through user_gmail_assignments to filter to assigned accounts.
        const { data } = await supabase
            .from('user_gmail_assignments')
            .select('gmail_accounts!inner(id, status, warmup_enabled, warmup_day)')
            .eq('user_id', ownerId);
        if (!data) return 0;
        return data.reduce((sum, row: any) => {
            const acc = Array.isArray(row.gmail_accounts) ? row.gmail_accounts[0] : row.gmail_accounts;
            if (!acc || acc.status !== 'ACTIVE') return sum;
            return sum + effectiveLimit(acc);
        }, 0);
    }
    // ADMIN / ACCOUNT_MANAGER — all active accounts
    const { data } = await supabase
        .from('gmail_accounts')
        .select('id, status, warmup_enabled, warmup_day')
        .eq('status', 'ACTIVE');
    if (!data) return 0;
    return data.reduce((sum, acc: any) => sum + effectiveLimit(acc), 0);
}

/**
 * Realistic per-account daily cold-send rate. accountRotationService caps at 500
 * which is the absolute Gmail ceiling for fully-warmed mailboxes — but for cold
 * outreach the safe rate is much lower (deliverability degrades, accounts get
 * flagged). Using 30/day per active warmed account, 5+5×day for warmup accounts.
 *
 * When `gmail_accounts.daily_send_limit` is migrated and admins set per-account
 * caps, replace this with the column value.
 */
function effectiveLimit(acc: { warmup_enabled?: boolean; warmup_day?: number }): number {
    const COLD_OUTREACH_PER_ACCOUNT = 30;
    if (!acc.warmup_enabled) return COLD_OUTREACH_PER_ACCOUNT;
    const warmupDay = acc.warmup_day ?? 0;
    return Math.min(COLD_OUTREACH_PER_ACCOUNT, 5 + warmupDay * 5);
}

// ─── Funnel computation per scenario ─────────────────────────────────────────

/**
 * Compute a funnel from a contact subset using shrinkage toward niche priors.
 * `contacts` are the historical contacts that match this scenario's filter.
 */
function computeFunnelFromContacts(contacts: RawContact[], niche: string): FunnelRates {
    const prior = NICHE_PRIORS[niche] ?? NICHE_PRIORS.wedding_filmmakers!;

    let totalSent = 0;
    let totalReceived = 0;
    let stageAdvanced = 0; // reached LEAD or beyond
    let closed = 0;
    let revenueSum = 0;
    let revenueCount = 0;

    const ADVANCED_STAGES = new Set(['LEAD', 'OFFER_ACCEPTED', 'CLOSED']);

    for (const c of contacts) {
        totalSent += c.total_emails_sent ?? 0;
        totalReceived += c.total_emails_received ?? 0;
        if (c.pipeline_stage && ADVANCED_STAGES.has(c.pipeline_stage)) stageAdvanced++;
        if (c.pipeline_stage === 'CLOSED' || c.is_client) {
            closed++;
            if (c.total_revenue && c.total_revenue > 0) {
                revenueSum += c.total_revenue;
                revenueCount++;
            }
        }
    }

    // We don't have separate "delivered" / "opened" counts at the contact-aggregate
    // level here; treat total_emails_sent as the funnel root, and use received
    // as a proxy for the (open × reply) compound rate. The shrinkage hides the
    // distortion when n is low; once we add per-message tracking aggregates
    // we'll split deliver/open/reply properly.
    const replyCompound = totalSent > 0 ? totalReceived / totalSent : prior.open * prior.reply;
    const meetingRate = totalReceived > 0 ? stageAdvanced / totalReceived : prior.meeting;
    const closeRate = stageAdvanced > 0 ? closed / stageAdvanced : prior.close;
    const avgDeal = revenueCount > 0 ? revenueSum / revenueCount : prior.avgDealSize;

    // Decompose replyCompound into open × reply by holding open at prior and
    // letting reply absorb the residual. Keeps the UI funnel chart honest.
    const observedOpen = prior.open;
    const observedReply = observedOpen > 0 ? replyCompound / observedOpen : prior.reply;

    const f: FunnelRates = {
        deliver: shrink(prior.deliver, totalSent, prior.deliver),
        open: shrink(observedOpen, totalSent, prior.open),
        reply: shrink(observedReply, totalSent, prior.reply),
        meeting: shrink(meetingRate, totalReceived, prior.meeting),
        close: shrink(closeRate, stageAdvanced, prior.close),
        // Avg deal is a money value, not a probability — don't clamp to [0,1].
        avgDealSize:
            revenueCount > 0
                ? (revenueCount * avgDeal + SHRINKAGE_K * prior.avgDealSize) /
                  (revenueCount + SHRINKAGE_K)
                : prior.avgDealSize,
        sampleSize: totalSent,
    };
    return f;
}

// ─── Scenario builders ───────────────────────────────────────────────────────

/** Region scenarios — top regions by historical revenue per send. */
function buildRegionScenarios(contacts: RawContact[], niche: string): Scenario[] {
    const byRegion = new Map<string, RawContact[]>();
    for (const c of contacts) {
        const r = topRegionOf(c.location);
        if (r === 'Unknown') continue;
        const arr = byRegion.get(r) ?? [];
        arr.push(c);
        byRegion.set(r, arr);
    }

    const out: Scenario[] = [];
    for (const [region, arr] of byRegion) {
        if (isLowBudgetRegion(region, niche)) continue;

        // Funnel uses ALL historical contacts in the region (the denominator
        // for measuring conversion). Eligibility filter only narrows the
        // pool we'd actually send to.
        const eligible = arr.filter(
            c =>
                isEligibleForColdOutreach(c) &&
                (!c.last_email_at || (c.days_since_last_contact ?? 999) > 30)
        );
        if (eligible.length < 10) continue; // not enough to make a scenario

        const funnel = computeFunnelFromContacts(arr, niche);
        if (funnel.avgDealSize < MIN_AVG_DEAL_SIZE_USD) continue; // hard floor on deal size

        const rps = revenuePerSend(funnel);
        out.push({
            id: `region:${region.toLowerCase().replace(/\s+/g, '_')}`,
            kind: 'REGION_TOP',
            label: region,
            detail: `${eligible.length} cold-eligible contacts (excluding clients & closed/offered/not-interested), ${arr.length} total in region`,
            poolMax: eligible.length,
            sendsAllocated: 0, // filled by capacity allocator
            funnel,
            projectedRevenue: 0, // filled after allocation
            confidence: bandFromSampleSize(funnel.sampleSize),
            blocker: null,
        });
        void rps;
    }

    // Top by revenue-per-send, take 5
    out.sort((a, b) => revenuePerSend(b.funnel) - revenuePerSend(a.funnel));
    return out.slice(0, 5);
}

/** Dormant re-engagement: contacts in CONTACTED/COLD_LEAD with >180 days since contact. */
function buildDormantScenario(contacts: RawContact[], niche: string): Scenario | null {
    const dormant = contacts.filter(c => {
        if (!isEligibleForDormantReengagement(c)) return false;
        return (c.days_since_last_contact ?? 0) > 180;
    });
    if (dormant.length < 30) return null;

    const funnel = computeFunnelFromContacts(dormant, niche);
    // Re-engagement reply rate empirically lower; deflate observed reply by 30%.
    funnel.reply *= 0.7;

    return {
        id: 'dormant:reengagement',
        kind: 'DORMANT_REENGAGEMENT',
        label: 'Re-engage dormant leads (no contact >6 months)',
        detail: `${dormant.length} contacts dormant >6mo`,
        poolMax: dormant.length,
        sendsAllocated: 0,
        funnel,
        projectedRevenue: 0,
        confidence: bandFromSampleSize(funnel.sampleSize),
        blocker: null,
    };
}

/** Add a 3rd follow-up to high-lead-score contacts whose campaigns have <3 followups. */
function buildFollowupDepthScenario(contacts: RawContact[], niche: string): Scenario | null {
    const candidates = contacts.filter(c => {
        if (!isEligibleForFollowupDepth(c)) return false;
        return (c.lead_score ?? 0) >= 50 && (c.followup_count ?? 0) < 3;
    });
    if (candidates.length < 30) return null;

    const baseFunnel = computeFunnelFromContacts(candidates, niche);
    // Lift: a 3rd follow-up captures FOLLOWUP_OPENED_NO_REPLY_LIFT of the open-but-no-reply pool.
    // Reply is conditional-on-open, so the lift is the fraction of opens that didn't reply.
    const liftedReply = clamp01(
        baseFunnel.reply + (1 - baseFunnel.reply) * FOLLOWUP_OPENED_NO_REPLY_LIFT
    );
    const funnel: FunnelRates = { ...baseFunnel, reply: liftedReply };

    return {
        id: 'followup:depth_3',
        kind: 'FOLLOWUP_DEPTH',
        label: 'Add 3rd follow-up to high-intent contacts',
        detail: `${candidates.length} in-flight contacts (CONTACTED/WARM/LEAD only, lead_score ≥ 50, <3 follow-ups)`,
        poolMax: candidates.length,
        sendsAllocated: 0,
        funnel,
        projectedRevenue: 0,
        confidence: bandFromSampleSize(funnel.sampleSize),
        blocker: null,
    };
}

/** Scrape-needed regions — high revenue-per-send but exhausted untouched pool. */
function buildScrapeNeededScenarios(contacts: RawContact[], niche: string): Scenario[] {
    const byRegion = new Map<string, RawContact[]>();
    for (const c of contacts) {
        const r = topRegionOf(c.location);
        if (r === 'Unknown') continue;
        const arr = byRegion.get(r) ?? [];
        arr.push(c);
        byRegion.set(r, arr);
    }

    const out: Scenario[] = [];
    for (const [region, arr] of byRegion) {
        if (isLowBudgetRegion(region, niche)) continue;

        const untouched = arr.filter(c =>
            !c.last_email_at || (c.days_since_last_contact ?? 999) > 30
        );
        if (untouched.length >= 50) continue; // there's still a regular pool to use

        const funnel = computeFunnelFromContacts(arr, niche);
        if (funnel.avgDealSize < MIN_AVG_DEAL_SIZE_USD) continue; // skip low-budget regions

        const rps = revenuePerSend(funnel);
        if (rps < 1) continue; // not worth scraping

        const targetSends = 500;
        out.push({
            id: `scrape:${region.toLowerCase().replace(/\s+/g, '_')}`,
            kind: 'SCRAPE_NEEDED',
            label: `Top up ${targetSends} more in ${region}`,
            detail: `Untouched pool exhausted (only ${untouched.length}). Historical RPS: $${rps.toFixed(2)}`,
            poolMax: 0, // can't allocate sends until scraped
            sendsAllocated: 0,
            funnel,
            projectedRevenue: targetSends * rps,
            confidence: bandFromSampleSize(funnel.sampleSize),
            // Blocker text now phrases the action positively — the new Top-up
            // button next to the scenario can resolve this in one click.
            blocker: `Pool exhausted in ${region}. Click “Top up from internet” to source ${targetSends} more.`,
            region,
        });
    }

    out.sort((a, b) => b.projectedRevenue - a.projectedRevenue);
    return out.slice(0, 3);
}

// ─── Capacity allocator ──────────────────────────────────────────────────────

/**
 * Allocate the dailySendCapacity × daysUntilDeadline budget to scenarios
 * proportionally to RPS (revenue-per-send), capped by each scenario's poolMax.
 * Spare from cap-bound scenarios flows to the next-highest-RPS one.
 *
 * Mutates each Scenario.sendsAllocated and Scenario.projectedRevenue.
 * Returns the total revenue projection.
 */
function allocateCapacity(scenarios: Scenario[], totalCapacity: number): number {
    // Skip blocker scenarios (e.g. SCRAPE_NEEDED) — they're informational only.
    const live = scenarios.filter(s => !s.blocker);

    // Pre-compute RPS per scenario.
    const rps = new Map<string, number>();
    for (const s of live) rps.set(s.id, revenuePerSend(s.funnel));

    // Sort highest RPS first.
    live.sort((a, b) => (rps.get(b.id) ?? 0) - (rps.get(a.id) ?? 0));

    let remaining = totalCapacity;
    for (const s of live) {
        const want = Math.min(s.poolMax, remaining);
        s.sendsAllocated = Math.max(0, Math.floor(want));
        s.projectedRevenue = s.sendsAllocated * (rps.get(s.id) ?? 0);
        remaining -= s.sendsAllocated;
        if (remaining <= 0) break;
    }

    // Total includes blocker scenarios' projection (already filled in builder).
    return scenarios.reduce((sum, s) => sum + s.projectedRevenue, 0);
}

// ─── Public entry point ──────────────────────────────────────────────────────

export type GenerateGoalPlanInput = {
    userId: string;
    role: string;
    goalAmount: number;
    deadlineISO: string;
    /** Workspace niche. v1: 'wedding_filmmakers'. */
    tenantNiche?: string;
};

export async function generateGoalPlan(input: GenerateGoalPlanInput): Promise<GoalPlan> {
    const niche = input.tenantNiche ?? 'wedding_filmmakers';
    if (!NICHE_PRIORS[niche]) {
        throw new Error(`Unknown niche: ${niche}`);
    }
    if (input.goalAmount <= 0) throw new Error('goalAmount must be > 0');

    const deadline = new Date(input.deadlineISO);
    const now = new Date();
    const daysUntilDeadline = Math.max(
        1,
        Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    );

    const [contacts, dailySendCapacity] = await Promise.all([
        fetchOwnedContacts(input.userId, input.role),
        fetchDailySendCapacity(input.userId, input.role),
    ]);

    const totalCapacity = dailySendCapacity * daysUntilDeadline;

    const regionScenarios = buildRegionScenarios(contacts, niche);
    const dormantScenario = buildDormantScenario(contacts, niche);
    const followupScenario = buildFollowupDepthScenario(contacts, niche);
    const scrapeScenarios = buildScrapeNeededScenarios(contacts, niche);

    const scenarios: Scenario[] = [
        ...regionScenarios,
        ...(dormantScenario ? [dormantScenario] : []),
        ...(followupScenario ? [followupScenario] : []),
        ...scrapeScenarios,
    ];

    const totalProjectedRevenue = allocateCapacity(scenarios, totalCapacity);

    let feasibility: GoalPlan['feasibility'];
    let feasibilityReason: string;
    if (dailySendCapacity === 0) {
        feasibility = 'BLOCKED';
        feasibilityReason = 'No active Gmail accounts assigned. Contact your admin.';
    } else if (totalProjectedRevenue >= input.goalAmount) {
        feasibility = 'OK';
        feasibilityReason = `Projected $${totalProjectedRevenue.toFixed(0)} ≥ goal $${input.goalAmount}.`;
    } else {
        feasibility = 'GAP';
        const gap = input.goalAmount - totalProjectedRevenue;
        feasibilityReason = `Best realistic projection: $${totalProjectedRevenue.toFixed(0)} (${Math.round(
            (totalProjectedRevenue / input.goalAmount) * 100
        )}% of goal). Gap of $${gap.toFixed(0)}.`;
    }

    // Sort final list by projectedRevenue descending so highest-impact appears first.
    scenarios.sort((a, b) => b.projectedRevenue - a.projectedRevenue);

    return {
        goalAmount: input.goalAmount,
        deadline: input.deadlineISO,
        daysUntilDeadline,
        dailySendCapacity,
        totalProjectedRevenue,
        scenarios,
        feasibility,
        feasibilityReason,
    };
}
