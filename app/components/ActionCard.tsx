'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Send, ChevronUp, Loader2, Clock, ExternalLink } from 'lucide-react';
import type { ActionItem } from '../../src/actions/actionQueueActions';
import type { LastEmail } from '../../src/actions/actionQueueActions';
import { getContactLastEmailsAction } from '../../src/actions/actionQueueActions';
import { sendEmailAction } from '../../src/actions/emailActions';
import { computeContactHabit, formatHabitSummary } from '../../src/utils/clientHabits';
import { extractReplyPreview } from '../../src/utils/emailPreview';

// Urgency dot colors based on time since reply
const URGENCY_DOT: Record<string, string> = {
    critical: 'var(--danger)',
    high: '#EA580C',
    medium: '#D97706',
    low: 'var(--ink-muted)',
};


function absoluteDate(dateStr: string | null): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

type Props = {
    action: ActionItem;
    onQuickEmail: (action: ActionItem) => void;
    onSnooze: (contactId: string, days: number) => void;
    onDone: (contactId: string) => void;
    accounts: { id: string; email: string; name?: string }[];
    expandedId: string | null;
    onToggleExpand: (id: string) => void;
};

export default function ActionCard({ action, onQuickEmail, onSnooze, onDone, accounts, expandedId, onToggleExpand }: Props) {
    const dotColor = URGENCY_DOT[action.urgency] || URGENCY_DOT.low;
    const isExpanded = expandedId === action.id;

    const [emails, setEmails] = useState<LastEmail[]>([]);
    const [loadingEmails, setLoadingEmails] = useState(false);
    const [emailsLoaded, setEmailsLoaded] = useState(false);
    const [emailLoadError, setEmailLoadError] = useState(false);
    const [suggestedAccountId, setSuggestedAccountId] = useState<string | null>(null);

    const [replyBody, setReplyBody] = useState('');
    const [fromAccountId, setFromAccountId] = useState('');
    const [sending, setSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [showSnooze, setShowSnooze] = useState(false);
    const [hovered, setHovered] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!isExpanded || loadingEmails) return;
        setLoadingEmails(true);
        setEmailLoadError(false);
        getContactLastEmailsAction(action.contactId)
            .then(result => {
                setEmails(result.emails);
                setSuggestedAccountId(result.gmailAccountId);
                setEmailsLoaded(true);
                const suggestedId = result.gmailAccountId;
                const matchesAvailable = suggestedId && accounts.some(a => a.id === suggestedId);
                if (matchesAvailable) {
                    setFromAccountId(suggestedId);
                } else if (accounts.length > 0 && accounts[0]) {
                    const threadAccountIds = result.emails.filter(e => e.gmail_account_id).map(e => e.gmail_account_id);
                    const matchFromThread = accounts.find(a => threadAccountIds.includes(a.id));
                    setFromAccountId(matchFromThread?.id || accounts[0].id);
                }
            })
            .catch(() => { setEmailsLoaded(true); setEmailLoadError(true); })
            .finally(() => setLoadingEmails(false));
    }, [isExpanded, action.contactId, accounts]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (isExpanded && emailsLoaded && textareaRef.current) {
            setTimeout(() => textareaRef.current?.focus(), 300);
        }
    }, [isExpanded, emailsLoaded]);

    const toggleExpand = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleExpand(action.id);
    };

    const handleSend = async () => {
        if (!replyBody.trim() || !fromAccountId) return;
        setSending(true);
        setSendError(null);
        try {
            const lastReceived = emails.find(e => e.direction === 'RECEIVED');
            const lastEmail = emails[0];
            const subject = lastReceived?.subject || lastEmail?.subject || `Re: conversation with ${action.name}`;
            const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
            const result = await sendEmailAction({
                accountId: fromAccountId, to: action.email, subject: reSubject,
                body: replyBody, threadId: lastEmail?.thread_id || undefined,
            });
            if (result.success) {
                setSendSuccess(true);
                setTimeout(() => onDone(action.contactId), 1500);
            } else {
                setSendError(result.error || 'Failed to send');
            }
        } catch { setSendError('Network error — try again'); }
        finally { setSending(false); }
    };

    // Thread-aware conversation pairing
    const lastReceived = emails.find(e => e.direction === 'RECEIVED');
    const sentEmails = emails.filter(e => e.direction === 'SENT');
    let lastSent: typeof lastReceived = undefined;
    if (lastReceived && sentEmails.length > 0) {
        const sameThread = sentEmails.find(e => e.thread_id && e.thread_id === lastReceived.thread_id);
        lastSent = sameThread || sentEmails[0];
    } else {
        lastSent = sentEmails[0];
    }
    const habit = emails.length >= 3 ? computeContactHabit(emails) : null;
    const habitSummary = formatHabitSummary(habit);

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => { setHovered(false); setShowSnooze(false); }}
            style={{
                background: 'var(--shell)',
                border: `1px solid ${isExpanded ? 'var(--accent)' : hovered ? 'var(--hairline)' : 'var(--hairline)'}`,
                borderRadius: isExpanded ? 16 : 12,
                overflow: 'hidden',
                transition: 'all .25s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: isExpanded
                    ? '0 8px 32px rgba(0,0,0,.08)'
                    : hovered ? '0 1px 4px rgba(0,0,0,.04)' : 'none',
                transform: hovered && !isExpanded ? 'translateY(-1px)' : 'none',
            }}
        >
            {/* Collapsed Row */}
            <div
                onClick={toggleExpand}
                style={{
                    padding: '14px 20px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    cursor: 'pointer',
                }}
            >
                {/* Urgency dot */}
                <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: dotColor, flexShrink: 0,
                }} />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <Link
                            href={`/clients/${action.contactId}`}
                            onClick={e => e.stopPropagation()}
                            style={{
                                fontSize: 15, fontWeight: 600, color: 'var(--ink)',
                                textDecoration: 'none', overflow: 'hidden',
                                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                        >
                            {action.name}
                        </Link>
                        {action.totalEmailsSent > 0 && (
                            <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontWeight: 400, flexShrink: 0 }}>
                                {action.totalEmailsSent}/{action.totalEmailsReceived}
                            </span>
                        )}
                    </div>
                    <div style={{
                        fontSize: 13, color: 'var(--ink-2)', marginTop: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {action.reason}
                    </div>
                </div>

                {/* Right side: actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {/* Snooze + Done — visible on hover only */}
                    {(hovered || isExpanded) && !sendSuccess && (
                        <>
                            <div style={{ position: 'relative' }}>
                                <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); setShowSnooze(!showSnooze); }}
                                    style={{
                                        width: 30, height: 30, borderRadius: 8,
                                        border: '1px solid var(--hairline)', background: 'var(--shell)',
                                        color: 'var(--ink-muted)', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all .15s',
                                    }}
                                    title="Snooze"
                                >
                                    <Clock size={13} />
                                </button>
                                {showSnooze && (
                                    <div style={{
                                        position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                        background: 'var(--shell)', borderRadius: 10,
                                        boxShadow: '0 8px 30px rgba(0,0,0,.12)',
                                        border: '1px solid var(--hairline)', zIndex: 10, padding: 4, minWidth: 110,
                                    }}>
                                        {[1, 3, 7, 14].map(d => (
                                            <button key={d} type="button" onClick={e => { e.stopPropagation(); onSnooze(action.contactId, d); setShowSnooze(false); }} style={{
                                                display: 'block', width: '100%', padding: '7px 12px', border: 'none',
                                                background: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                                textAlign: 'left', borderRadius: 6, color: 'var(--ink-2)',
                                                fontFamily: "'DM Sans', sans-serif",
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                            >
                                                {d} day{d > 1 ? 's' : ''}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button type="button" onClick={e => { e.stopPropagation(); onDone(action.contactId); }} style={{
                                width: 30, height: 30, borderRadius: 8,
                                border: '1px solid var(--coach)', background: 'var(--coach-soft)',
                                color: 'var(--coach)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 14, fontWeight: 600, transition: 'all .15s',
                            }} title="Done">
                                {'\u2713'}
                            </button>
                        </>
                    )}

                    {/* Reply / Collapse */}
                    <button type="button" onClick={toggleExpand} style={{
                        padding: '7px 14px', borderRadius: 8, border: 'none',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 5,
                        transition: 'all .15s',
                        background: isExpanded ? 'var(--ink)' : 'transparent',
                        color: isExpanded ? '#fff' : 'var(--accent)',
                    }}>
                        {isExpanded ? (
                            <><ChevronUp size={14} /> Collapse</>
                        ) : (
                            <>Reply {'\u2192'}</>
                        )}
                    </button>
                </div>
            </div>

            {/* Expanded Section */}
            {isExpanded && (
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        borderTop: '1px solid var(--hairline-soft)',
                        padding: '20px 24px',
                        animation: 'aq-expand .3s cubic-bezier(0.16,1,0.3,1) both',
                    }}
                >
                    <style>{`@keyframes aq-expand { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>

                    {loadingEmails ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
                            <Loader2 size={18} className="action-spin" style={{ display: 'inline-block', marginRight: 8 }} />
                            Loading...
                        </div>
                    ) : sendSuccess ? (
                        <div style={{ padding: 32, textAlign: 'center' }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: '50%', margin: '0 auto 12px',
                                                background: 'linear-gradient(135deg, var(--coach-soft), color-mix(in oklab, var(--coach), transparent 92%))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Send size={20} color="var(--coach)" />
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Reply sent</div>
                            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>Removing from queue...</div>
                        </div>
                    ) : (
                        <>
                            {emailLoadError && (
                                <div style={{
                                    background: 'var(--danger-soft)', borderRadius: 10, padding: 12, marginBottom: 16,
                                    border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 13,
                                }}>
                                    Failed to load conversation.
                                </div>
                            )}

                            {/* Conversation */}
                            {!emailLoadError && emails.length > 0 && (
                                <div style={{ marginBottom: 20 }}>
                                    {lastReceived && (
                                        <div style={{
                                            background: 'var(--surface-2)', borderRadius: 12, padding: 16,
                                            marginBottom: 8, borderLeft: '3px solid var(--accent)',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                                                    Their message
                                                </span>
                                                <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                                                    {absoluteDate(lastReceived.sent_at)}
                                                </span>
                                            </div>
                                            {lastReceived.subject && (
                                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
                                                    {lastReceived.subject}
                                                </div>
                                            )}
                                            <div style={{
                                                fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6,
                                                maxHeight: 100, overflow: 'hidden',
                                                WebkitMaskImage: 'linear-gradient(180deg, black 60%, transparent 100%)',
                                                maskImage: 'linear-gradient(180deg, black 60%, transparent 100%)',
                                            }}>
                                                {extractReplyPreview(lastReceived.body, lastReceived.snippet, 300) || 'No preview'}
                                            </div>
                                        </div>
                                    )}

                                    {lastSent && (
                                        <div style={{
                                            background: 'var(--surface-2)', borderRadius: 12, padding: 14,
                                            marginBottom: 8, borderLeft: '3px solid var(--hairline)',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                                                    Your last email
                                                </span>
                                                <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                                                    {absoluteDate(lastSent.sent_at)}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, maxHeight: 48, overflow: 'hidden' }}>
                                                {extractReplyPreview(lastSent.body, lastSent.snippet, 200) || 'No preview'}
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                        <Link href={`/clients/${action.contactId}`} style={{
                                            fontSize: 12, color: 'var(--accent)', fontWeight: 500, textDecoration: 'none',
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                        }}>
                                            <ExternalLink size={11} /> View full conversation
                                        </Link>
                                        {habitSummary && (
                                            <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                                                Best time: <strong>{habitSummary}</strong>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!emailLoadError && emails.length === 0 && (
                                <div style={{
                                    background: 'var(--surface-2)', borderRadius: 10, padding: 20,
                                    textAlign: 'center', marginBottom: 20, color: 'var(--ink-muted)', fontSize: 13,
                                }}>
                                    No previous emails. This will be your first message.
                                </div>
                            )}

                            {/* Composer — minimal */}
                            <div style={{
                                background: 'var(--surface-2)', borderRadius: 12,
                                border: '1px solid var(--hairline)', overflow: 'hidden',
                            }}>
                                {/* Single-line From */}
                                <div style={{
                                    padding: '8px 16px', borderBottom: '1px solid var(--hairline-soft)',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    fontSize: 12, color: 'var(--ink-muted)',
                                }}>
                                    <span>via</span>
                                    <select
                                        value={fromAccountId}
                                        onChange={e => setFromAccountId(e.target.value)}
                                        style={{
                                            border: 'none', fontSize: 12, color: 'var(--ink-2)',
                                            background: 'transparent', outline: 'none', fontWeight: 500,
                                            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                                        }}
                                    >
                                        <option value="">Select account...</option>
                                        {accounts.map(acc => (
                                            <option key={acc.id} value={acc.id}>
                                                {acc.email}{acc.id === suggestedAccountId ? ' (thread account)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Textarea */}
                                <textarea
                                    ref={textareaRef}
                                    value={replyBody}
                                    onChange={e => setReplyBody(e.target.value)}
                                    placeholder="Write your reply..."
                                    style={{
                                        width: '100%', minHeight: 100, padding: '14px 16px',
                                        border: 'none', outline: 'none', resize: 'vertical',
                                        fontSize: 14, lineHeight: 1.6, color: 'var(--ink)',
                                        fontFamily: "'DM Sans', system-ui, sans-serif",
                                        boxSizing: 'border-box', background: 'var(--shell)',
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                />

                                {sendError && (
                                    <div style={{
                                        padding: '8px 16px', background: 'var(--danger-soft)', color: 'var(--danger)',
                                        fontSize: 12, borderTop: '1px solid var(--danger)',
                                    }}>
                                        {sendError}
                                    </div>
                                )}

                                {/* Bottom bar */}
                                <div style={{
                                    padding: '8px 16px', borderTop: '1px solid var(--hairline-soft)',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    background: 'var(--surface-2)',
                                }}>
                                    <button type="button" onClick={() => onQuickEmail(action)} style={{
                                        background: 'none', border: 'none', padding: '4px 0',
                                        fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer',
                                        fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
                                    }}>
                                        Template
                                    </button>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 11, color: 'var(--hairline)' }}>
                                            {'\u2318'}+Enter
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleSend}
                                            disabled={!replyBody.trim() || !fromAccountId || sending}
                                            style={{
                                                background: (replyBody.trim() && fromAccountId) ? 'var(--ink)' : 'var(--hairline)',
                                                color: (replyBody.trim() && fromAccountId) ? '#fff' : 'var(--ink-muted)',
                                                border: 'none', borderRadius: 8,
                                                padding: '8px 20px', fontSize: 13, fontWeight: 600,
                                                cursor: (replyBody.trim() && fromAccountId) ? 'pointer' : 'not-allowed',
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                transition: 'all .15s', opacity: sending ? 0.7 : 1,
                                                fontFamily: "'DM Sans', sans-serif",
                                            }}
                                        >
                                            {sending ? (
                                                <><Loader2 size={14} className="action-spin" /> Sending</>
                                            ) : (
                                                <>Send</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
