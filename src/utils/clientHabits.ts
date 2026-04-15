/**
 * Compute a contact's communication habit from their email history.
 *
 * Pure function — no DB calls, no side effects. Takes a list of emails
 * and returns the median hour, dominant day, and average response time.
 *
 * Requires at least 3 RECEIVED emails for meaningful signal; otherwise
 * returns null so the UI can fall back gracefully.
 */

export type ContactHabit = {
    preferredHour: number;        // 0-23, local time (naive — no timezone correction yet)
    preferredDay: number;         // 0-6, 0 = Sunday
    avgResponseHours: number | null;
    sampleSize: number;           // how many RECEIVED emails informed this
};

type HabitEmail = {
    direction: 'SENT' | 'RECEIVED' | string;
    sent_at: string | null;
    thread_id?: string | null;
};

export function computeContactHabit(emails: HabitEmail[]): ContactHabit | null {
    const received = emails.filter(e => e.direction === 'RECEIVED' && e.sent_at);
    if (received.length < 3) return null;

    // Median hour from received timestamps
    const hours = received
        .map(e => new Date(e.sent_at as string).getHours())
        .sort((a, b) => a - b);
    const medianHour = hours[Math.floor(hours.length / 2)] ?? 0;

    // Dominant day-of-week
    const dayCounts: Record<number, number> = {};
    received.forEach(e => {
        const d = new Date(e.sent_at as string).getDay();
        dayCounts[d] = (dayCounts[d] || 0) + 1;
    });
    const topDay = Object.entries(dayCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '1';

    // Average response time — find thread pairs: our SENT → their RECEIVED
    const sent = emails.filter(e => e.direction === 'SENT' && e.sent_at && e.thread_id);
    const responseHours: number[] = [];

    for (const r of received) {
        if (!r.thread_id || !r.sent_at) continue;
        const receivedTime = new Date(r.sent_at).getTime();

        // Find the most recent SENT email in the same thread before this received
        const priorSent = sent
            .filter(s => s.thread_id === r.thread_id && s.sent_at && new Date(s.sent_at).getTime() < receivedTime)
            .sort((a, b) => new Date(b.sent_at as string).getTime() - new Date(a.sent_at as string).getTime())[0];

        if (priorSent && priorSent.sent_at) {
            const diffHours = (receivedTime - new Date(priorSent.sent_at).getTime()) / (1000 * 60 * 60);
            // Cap at 1 week — longer gaps usually mean the thread was re-started, not a response
            if (diffHours > 0 && diffHours < 168) {
                responseHours.push(diffHours);
            }
        }
    }

    const avgResponseHours = responseHours.length > 0
        ? Math.round(responseHours.reduce((a, b) => a + b, 0) / responseHours.length)
        : null;

    return {
        preferredHour: medianHour,
        preferredDay: parseInt(topDay, 10),
        avgResponseHours,
        sampleSize: received.length,
    };
}

const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export function formatHabitSummary(habit: ContactHabit | null): string | null {
    if (!habit) return null;
    const h = habit.preferredHour;
    const hourStr =
        h === 0 ? '12am' :
        h < 12 ? `${h}am` :
        h === 12 ? '12pm' :
        `${h - 12}pm`;
    return `${DAY_NAMES[habit.preferredDay]} around ${hourStr}`;
}

export function formatResponseTime(hours: number | null): string | null {
    if (hours == null) return null;
    if (hours < 1) return 'usually replies within an hour';
    if (hours < 24) return `usually replies within ${hours}h`;
    const days = Math.round(hours / 24);
    return `usually replies within ${days} day${days > 1 ? 's' : ''}`;
}
