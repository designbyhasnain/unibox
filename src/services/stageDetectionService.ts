import 'server-only';

export type StageConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface StageSignal {
    suggestedStage: string;
    confidence: StageConfidence;
    reason: string;
    matchedKeywords: string[];
}

// Word-boundary safe regex builder
function kw(word: string): RegExp {
    return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
}

const ACCEPTANCE_HIGH: RegExp[] = [
    kw("let's do it"), kw("let's proceed"), kw("let's lock it in"), kw("go ahead"),
    kw("send invoice"), kw("send payment"), kw("payment link"), kw("book it"),
    kw("ready to start"), kw("let's get started"), kw("move forward"),
    kw("here are the files"), kw("uploaded the footage"), kw("shared the drive"),
    kw("sent the dropbox"), kw("payment sent"), kw("zelle sent"),
    kw("I'm in"), kw("confirmed"), kw("approved"),
];

const ACCEPTANCE_MEDIUM: RegExp[] = [
    kw("sounds great"), kw("sounds good"), kw("agreed"), kw("deal"),
    kw("let's do this"), kw("accepted"), kw("approve"), kw("yes"),
    kw("perfect"), kw("works for me"), kw("count me in"),
];

const INTEREST_KEYWORDS: RegExp[] = [
    kw("interested"), kw("tell me more"), kw("I'd love to"), kw("send me"),
    kw("share your portfolio"), kw("how much"), kw("pricing"), kw("rates"),
    kw("what do you charge"), kw("packages"), kw("quote"),
    kw("let's meet"), kw("schedule"), kw("availability"), kw("hop on a call"),
    kw("google meet"), kw("zoom call"), kw("free test"), kw("sample"),
];

const REJECTION_KEYWORDS: RegExp[] = [
    kw("not interested"), kw("no thanks"), kw("no thank you"), kw("pass"),
    kw("stop emailing"), kw("unsubscribe"), kw("remove me"),
    kw("don't contact"), kw("already have an editor"), kw("found someone"),
    kw("not looking"), kw("not for us"),
];

// These look like rejections but aren't — skip stage change
const FALSE_POSITIVE_PATTERNS: RegExp[] = [
    /cancel\s+(the\s+)?meeting/i,
    /reschedule/i,
    /not\s+sure\s+about\s+(the\s+)?timeline/i,
    /need\s+to\s+think/i,
    /maybe\s+later/i,
    /tight\s+budget/i,
];

/**
 * Strip quoted text from email body so we only analyze the NEW message.
 * Prevents false positives from keywords in quoted replies.
 */
function stripQuotedText(body: string): string {
    let text = body
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();

    // Cut at common quote markers
    const cutMarkers = ['On ', 'wrote:', '------', 'From:', 'Sent from', '________', '-----Original'];
    for (const marker of cutMarkers) {
        const idx = text.indexOf(marker);
        if (idx > 20) { text = text.slice(0, idx).trim(); break; }
    }

    return text.slice(0, 2000);
}

/**
 * Detect pipeline stage signals from email body content.
 * Only analyzes the NEW message (strips quoted text).
 * Returns null if no signal detected.
 */
export function detectStageSignal(
    rawBody: string,
    currentStage: string | null,
    direction: 'SENT' | 'RECEIVED'
): StageSignal | null {
    // Only analyze received emails (their words, not ours)
    if (direction !== 'RECEIVED') return null;

    const body = stripQuotedText(rawBody);
    if (body.length < 5) return null;

    // Check for false positives first
    if (FALSE_POSITIVE_PATTERNS.some(p => p.test(body))) return null;

    // 1. Check HIGH confidence acceptance → OFFER_ACCEPTED
    const highMatches = ACCEPTANCE_HIGH.filter(r => r.test(body));
    if (highMatches.length > 0) {
        // Don't downgrade CLOSED
        if (currentStage === 'CLOSED') return null;
        return {
            suggestedStage: 'OFFER_ACCEPTED',
            confidence: 'HIGH',
            reason: `Client indicated acceptance`,
            matchedKeywords: highMatches.map(r => r.source.replace(/\\b/g, '')),
        };
    }

    // 2. Check MEDIUM confidence acceptance → OFFER_ACCEPTED
    const medMatches = ACCEPTANCE_MEDIUM.filter(r => r.test(body));
    if (medMatches.length >= 2) {
        // Multiple medium signals = HIGH confidence
        if (currentStage === 'CLOSED' || currentStage === 'OFFER_ACCEPTED') return null;
        return {
            suggestedStage: 'OFFER_ACCEPTED',
            confidence: 'MEDIUM',
            reason: `Multiple positive signals detected`,
            matchedKeywords: medMatches.map(r => r.source.replace(/\\b/g, '')),
        };
    }

    // 3. Check interest keywords → LEAD
    const interestMatches = INTEREST_KEYWORDS.filter(r => r.test(body));
    if (interestMatches.length > 0) {
        // Don't downgrade from LEAD or above
        if (['LEAD', 'OFFER_ACCEPTED', 'CLOSED'].includes(currentStage || '')) return null;
        return {
            suggestedStage: 'LEAD',
            confidence: interestMatches.length >= 2 ? 'HIGH' : 'MEDIUM',
            reason: `Client showed interest`,
            matchedKeywords: interestMatches.map(r => r.source.replace(/\\b/g, '')),
        };
    }

    // 4. Check rejection keywords → flag only (NOT auto-applied)
    const rejectionMatches = REJECTION_KEYWORDS.filter(r => r.test(body));
    if (rejectionMatches.length > 0) {
        return {
            suggestedStage: 'NOT_INTERESTED',
            confidence: 'LOW', // Always LOW — never auto-apply rejection
            reason: `Possible rejection detected (manual review needed)`,
            matchedKeywords: rejectionMatches.map(r => r.source.replace(/\\b/g, '')),
        };
    }

    return null;
}

/**
 * Determine the correct stage for a contact based on their email history + project data.
 * Used for backfilling existing contacts.
 */
export function determineCorrectStage(params: {
    currentStage: string | null;
    hasSentEmails: boolean;
    hasReceivedEmails: boolean;
    hasProjects: boolean;
    openCount: number;
    latestReceivedBody?: string;
}): { stage: string; reason: string } | null {
    const { currentStage, hasSentEmails, hasReceivedEmails, hasProjects, openCount, latestReceivedBody } = params;

    // Rule 1: Has projects → CLOSED (unless already CLOSED)
    if (hasProjects && currentStage !== 'CLOSED') {
        return { stage: 'CLOSED', reason: 'Has linked projects' };
    }

    // Rule 2: Has received replies + we sent emails → at least LEAD
    if (hasReceivedEmails && hasSentEmails) {
        if (['COLD_LEAD', 'CONTACTED', 'WARM_LEAD'].includes(currentStage || '')) {
            // Check if latest reply has acceptance keywords
            if (latestReceivedBody) {
                const signal = detectStageSignal(latestReceivedBody, currentStage, 'RECEIVED');
                if (signal && signal.suggestedStage === 'OFFER_ACCEPTED' && signal.confidence !== 'LOW') {
                    return { stage: 'OFFER_ACCEPTED', reason: `Acceptance detected: ${signal.reason}` };
                }
            }
            return { stage: 'LEAD', reason: 'Contact replied to our outreach' };
        }
    }

    // Rule 3: We sent emails but no reply → CONTACTED
    if (hasSentEmails && !hasReceivedEmails && currentStage === 'COLD_LEAD') {
        return { stage: 'CONTACTED', reason: 'We emailed them, no reply yet' };
    }

    // Rule 4: 2+ opens, no reply → WARM_LEAD
    if (openCount >= 2 && !hasReceivedEmails && ['COLD_LEAD', 'CONTACTED'].includes(currentStage || '')) {
        return { stage: 'WARM_LEAD', reason: `${openCount} opens, no reply` };
    }

    return null; // No change needed
}
