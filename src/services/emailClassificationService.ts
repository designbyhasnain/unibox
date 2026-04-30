import 'server-only';
/**
 * Email Classification Service
 *
 * Classifies every email into one of 5 types for accurate analytics:
 *
 * OUTGOING:
 *   OUTREACH_FIRST  - First email sent in a thread (cold outreach)
 *   FOLLOW_UP       - Sent again before they replied
 *   CONVERSATIONAL  - Sent after they already replied (active dialogue)
 *
 * INCOMING:
 *   FIRST_REPLY     - First inbound reply from contact in thread
 *   CONTINUED_REPLY - Subsequent inbound replies
 *
 * Correct reply rate = FIRST_REPLY count / unique prospects with OUTREACH_FIRST
 */

export type EmailType = 'OUTREACH_FIRST' | 'FOLLOW_UP' | 'CONVERSATIONAL' | 'FIRST_REPLY' | 'CONTINUED_REPLY';

interface ThreadMessage {
    direction: 'SENT' | 'RECEIVED';
    sent_at: string;
}

/**
 * Classify a SENT email based on thread history.
 */
export function classifySentEmail(threadMessages: ThreadMessage[]): EmailType {
    const sorted = [...threadMessages].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());

    const hasPriorSent = sorted.some(m => m.direction === 'SENT');
    const hasPriorReceived = sorted.some(m => m.direction === 'RECEIVED');

    if (!hasPriorSent) {
        // No previous sent emails in thread → this is the first outreach
        return 'OUTREACH_FIRST';
    }

    if (hasPriorReceived) {
        // They already replied at least once → we're in dialogue
        return 'CONVERSATIONAL';
    }

    // We sent before but they never replied → follow-up
    return 'FOLLOW_UP';
}

/**
 * Classify a RECEIVED email based on thread history.
 */
export function classifyReceivedEmail(threadMessages: ThreadMessage[], firstReplyReceived: boolean): { emailType: EmailType; isFirstReply: boolean } {
    if (!firstReplyReceived) {
        // No prior inbound reply in this thread
        const hasPriorReceived = threadMessages.some(m => m.direction === 'RECEIVED');
        if (!hasPriorReceived) {
            return { emailType: 'FIRST_REPLY', isFirstReply: true };
        }
    }

    return { emailType: 'CONTINUED_REPLY', isFirstReply: false };
}

/**
 * Classify a single email given full thread context.
 * Used for backfilling existing emails.
 */
export function classifyEmailInThread(
    email: { direction: 'SENT' | 'RECEIVED'; sent_at: string },
    priorMessages: ThreadMessage[],
    firstReplyAlreadySet: boolean
): { emailType: EmailType; setsFirstReply: boolean } {
    if (email.direction === 'SENT') {
        return { emailType: classifySentEmail(priorMessages), setsFirstReply: false };
    }

    // RECEIVED
    const { emailType, isFirstReply } = classifyReceivedEmail(priorMessages, firstReplyAlreadySet);
    return { emailType, setsFirstReply: isFirstReply };
}
