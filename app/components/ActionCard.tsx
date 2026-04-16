'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Send, ChevronUp, Clock, ExternalLink, Loader2, MessageSquare } from 'lucide-react';
import type { ActionItem } from '../../src/actions/actionQueueActions';
import type { LastEmail } from '../../src/actions/actionQueueActions';
import { getContactLastEmailsAction } from '../../src/actions/actionQueueActions';
import { sendEmailAction } from '../../src/actions/emailActions';
import { computeContactHabit, formatHabitSummary } from '../../src/utils/clientHabits';
import { extractReplyPreview } from '../../src/utils/emailPreview';

const DEFAULT_STYLE = { bg: '#f8fafc', border: '#94a3b8', badge: '#64748b', text: 'LOW', expandBg: '#f9fafb' };
const URGENCY_STYLES = {
    critical: { bg: '#fef2f2', border: '#dc2626', badge: '#dc2626', text: 'URGENT', expandBg: '#fff5f5' },
    high: { bg: '#fffbeb', border: '#d97706', badge: '#d97706', text: 'HIGH', expandBg: '#fffef5' },
    medium: { bg: '#eff6ff', border: '#2563eb', badge: '#2563eb', text: 'MEDIUM', expandBg: '#f5f9ff' },
    low: DEFAULT_STYLE,
} as const;

const ACTION_ICONS: Record<string, string> = {
    REPLY_NOW: '\uD83D\uDCE9',
    NEW_LEAD: '\uD83C\uDD95',
    FOLLOW_UP: '\uD83D\uDD04',
    WIN_BACK: '\uD83C\uDFAF',
    STALE: '\uD83D\uDCA4',
};

function timeAgo(dateStr: string | null): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
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
    const style = (URGENCY_STYLES as Record<string, typeof DEFAULT_STYLE>)[action.urgency] ?? DEFAULT_STYLE;
    const icon = ACTION_ICONS[action.actionType] || '\uD83D\uDCCB';
    const isExpanded = expandedId === action.id;

    const [emails, setEmails] = useState<LastEmail[]>([]);
    const [loadingEmails, setLoadingEmails] = useState(false);
    const [emailsLoaded, setEmailsLoaded] = useState(false);
    const [emailLoadError, setEmailLoadError] = useState(false);
    const [suggestedAccountId, setSuggestedAccountId] = useState<string | null>(null);

    // Reply state
    const [replyBody, setReplyBody] = useState('');
    const [fromAccountId, setFromAccountId] = useState('');
    const [sending, setSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Load emails when expanded
    useEffect(() => {
        if (!isExpanded || emailsLoaded || loadingEmails) return;

        setLoadingEmails(true);
        getContactLastEmailsAction(action.contactId)
            .then(result => {
                setEmails(result.emails);
                setSuggestedAccountId(result.gmailAccountId);
                setEmailsLoaded(true);
                if (result.gmailAccountId) {
                    setFromAccountId(result.gmailAccountId);
                } else if (accounts.length > 0 && accounts[0]) {
                    setFromAccountId(accounts[0].id);
                }
            })
            .catch(err => {
                console.error('Failed to load emails:', err);
                setEmailsLoaded(true);
                setEmailLoadError(true);
            })
            .finally(() => setLoadingEmails(false));
    }, [isExpanded, emailsLoaded, loadingEmails, action.contactId, accounts]);

    // Focus textarea when expanded and emails loaded
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
                accountId: fromAccountId,
                to: action.email,
                subject: reSubject,
                body: replyBody,
                threadId: lastEmail?.thread_id || undefined,
            });

            if (result.success) {
                setSendSuccess(true);
                setTimeout(() => onDone(action.contactId), 1500);
            } else {
                setSendError(result.error || 'Failed to send email');
            }
        } catch (err) {
            console.error('Failed to send:', err);
            setSendError('Network error — please try again');
        } finally {
            setSending(false);
        }
    };

    const lastReceived = emails.find(e => e.direction === 'RECEIVED');
    const lastSent = emails.find(e => e.direction === 'SENT');
    const habit = emails.length >= 3 ? computeContactHabit(emails) : null;
    const habitSummary = formatHabitSummary(habit);

    return (
        <div style={{
            background: isExpanded ? '#fff' : style.bg,
            borderLeft: `4px solid ${style.border}`,
            borderRadius: 10,
            overflow: 'hidden',
            transition: 'all .25s ease',
            boxShadow: isExpanded ? '0 8px 32px rgba(0,0,0,.1)' : 'none',
        }}>
            {/* Main Row */}
            <div
                style={{
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    cursor: 'pointer',
                    transition: 'background .15s',
                    background: isExpanded ? style.bg : 'transparent',
                }}
                onClick={toggleExpand}
            >
                <span style={{ fontSize: 24, flexShrink: 0 }}>{icon}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <Link href={`/clients/${action.contactId}`} onClick={e => e.stopPropagation()} style={{
                            fontSize: 14, fontWeight: 700, color: '#0f172a', textDecoration: 'none',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {action.name}
                        </Link>
                        <span style={{
                            fontSize: 9, fontWeight: 700, background: style.badge, color: '#fff',
                            padding: '2px 8px', borderRadius: 4, letterSpacing: '.04em', flexShrink: 0,
                        }}>{style.text}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {action.reason}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 12 }}>
                        <span>{action.email}</span>
                        {action.location && <span>{action.location}</span>}
                        {action.totalEmailsSent > 0 && <span>{action.totalEmailsSent} sent / {action.totalEmailsReceived} received</span>}
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" onClick={toggleExpand} style={{
                        background: isExpanded ? '#1d4ed8' : '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
                        padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4, transition: 'background .15s',
                    }}>
                        {isExpanded ? <ChevronUp size={14} /> : <MessageSquare size={14} />}
                        {action.actionType === 'REPLY_NOW' ? 'Reply' : 'Email'}
                    </button>

                    {/* Snooze */}
                    <div style={{ position: 'relative' }}>
                        <button type="button" onClick={e => { e.stopPropagation(); setShowSnoozeOptions(!showSnoozeOptions); }} style={{
                            background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6,
                            padding: '6px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 2,
                        }} title="Snooze">
                            <Clock size={12} />
                        </button>
                        {showSnoozeOptions && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                background: '#fff', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                                border: '1px solid #e2e8f0', zIndex: 10, padding: 4, minWidth: 100,
                            }}>
                                {[1, 3, 7, 14].map(d => (
                                    <button key={d} type="button" onClick={e => { e.stopPropagation(); onSnooze(action.contactId, d); setShowSnoozeOptions(false); }} style={{
                                        display: 'block', width: '100%', padding: '6px 12px', border: 'none',
                                        background: 'none', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                                        textAlign: 'left', borderRadius: 4, color: '#334155',
                                    }}>
                                        {d} day{d > 1 ? 's' : ''}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button type="button" onClick={e => { e.stopPropagation(); onDone(action.contactId); }} style={{
                        background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6,
                        padding: '6px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    }} title="Mark done">
                        {'\u2713'}
                    </button>
                </div>
            </div>

            {/* Expanded Section — Email Context + Reply */}
            {isExpanded && (
                <div
                    onClick={e => e.stopPropagation()}
                    style={{
                        borderTop: `1px solid ${style.border}30`,
                        background: style.expandBg,
                    }}
                >
                    {loadingEmails ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                            <Loader2 size={18} className="action-spin" style={{ display: 'inline-block', marginRight: 8 }} />
                            Loading conversation...
                        </div>
                    ) : sendSuccess ? (
                        <div style={{ padding: 24, textAlign: 'center' }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>{'\u2705'}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#16a34a' }}>Reply sent!</div>
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Removing from queue...</div>
                        </div>
                    ) : (
                        <div style={{ padding: '16px 20px' }}>
                            {/* Email Load Error */}
                            {emailLoadError && (
                                <div style={{
                                    background: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 12,
                                    border: '1px solid #fecaca', color: '#dc2626', fontSize: 12, fontWeight: 500,
                                }}>
                                    Failed to load conversation. You can still compose a new message below.
                                </div>
                            )}

                            {/* Email Thread Context */}
                            {!emailLoadError && emails.length > 0 ? (
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                                        CONVERSATION
                                    </div>

                                    {/* Their last email */}
                                    {lastReceived && (
                                        <div style={{
                                            background: '#fff', borderRadius: 10, padding: 14,
                                            border: '1px solid #e2e8f0', marginBottom: 8,
                                            borderLeft: '3px solid #2563eb',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                                                <div>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                                                        {action.name}
                                                    </span>
                                                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>
                                                        {timeAgo(lastReceived.sent_at)}
                                                    </span>
                                                </div>
                                                <span style={{
                                                    fontSize: 9, fontWeight: 600, color: '#2563eb', background: '#eff6ff',
                                                    padding: '2px 6px', borderRadius: 4,
                                                }}>RECEIVED</span>
                                            </div>
                                            {lastReceived.subject && (
                                                <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                                                    {lastReceived.subject}
                                                </div>
                                            )}
                                            <div style={{
                                                fontSize: 12, color: '#475569', lineHeight: 1.5,
                                                maxHeight: 120, overflow: 'hidden',
                                                whiteSpace: 'pre-wrap',
                                                WebkitMaskImage: 'linear-gradient(180deg, black 70%, transparent 100%)',
                                                maskImage: 'linear-gradient(180deg, black 70%, transparent 100%)',
                                            }}>
                                                {extractReplyPreview(lastReceived.body, lastReceived.snippet, 300) || 'No preview available'}
                                            </div>
                                        </div>
                                    )}

                                    {/* Our last sent email */}
                                    {lastSent && (
                                        <div style={{
                                            background: '#f8fafc', borderRadius: 10, padding: 12,
                                            border: '1px solid #e2e8f0', marginBottom: 8,
                                            borderLeft: '3px solid #94a3b8',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                                <div>
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>You</span>
                                                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>{timeAgo(lastSent.sent_at)}</span>
                                                </div>
                                                <span style={{
                                                    fontSize: 9, fontWeight: 600, color: '#64748b', background: '#f1f5f9',
                                                    padding: '2px 6px', borderRadius: 4,
                                                }}>SENT</span>
                                            </div>
                                            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5, maxHeight: 60, overflow: 'hidden' }}>
                                                {extractReplyPreview(lastSent.body, lastSent.snippet, 200) || 'No preview'}
                                            </div>
                                        </div>
                                    )}

                                    <Link href={`/clients/${action.contactId}`} style={{
                                        fontSize: 11, color: '#2563eb', fontWeight: 500, textDecoration: 'none',
                                        display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
                                    }}>
                                        <ExternalLink size={11} /> View full conversation
                                    </Link>
                                </div>
                            ) : !emailLoadError ? (
                                <div style={{
                                    background: '#fff', borderRadius: 8, padding: 16,
                                    border: '1px dashed #e2e8f0', textAlign: 'center', marginBottom: 16,
                                    color: '#94a3b8', fontSize: 12,
                                }}>
                                    No previous emails found. This will be your first message.
                                </div>
                            ) : null}

                            {/* Habit hint */}
                            {habitSummary && (
                                <div style={{
                                    background: 'rgba(37,99,235,0.06)',
                                    border: '1px solid rgba(37,99,235,0.15)',
                                    borderRadius: 8, padding: '8px 12px', marginBottom: 10,
                                    fontSize: 11, color: '#1e40af', display: 'flex',
                                    alignItems: 'center', gap: 6,
                                }}>
                                    <span style={{ fontSize: 14 }}>{'\u23F0'}</span>
                                    <span><strong>Best time to reach:</strong> {habitSummary}</span>
                                </div>
                            )}

                            {/* Reply Composer */}
                            <div style={{
                                background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0',
                                overflow: 'hidden',
                            }}>
                                {/* From account selector */}
                                {accounts.length > 0 && (
                                    <div style={{
                                        padding: '8px 14px', borderBottom: '1px solid #f1f5f9',
                                        display: 'flex', alignItems: 'center', gap: 8,
                                    }}>
                                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>From:</span>
                                        <select
                                            value={fromAccountId}
                                            onChange={e => setFromAccountId(e.target.value)}
                                            style={{
                                                flex: 1, border: 'none', fontSize: 12, color: '#334155',
                                                background: 'transparent', outline: 'none', fontWeight: 500,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <option value="">Select account...</option>
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>
                                                    {acc.email}{acc.id === suggestedAccountId ? ' (conversation account)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* To */}
                                <div style={{
                                    padding: '6px 14px', borderBottom: '1px solid #f1f5f9',
                                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
                                }}>
                                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>To:</span>
                                    <span style={{ fontWeight: 500, color: '#334155' }}>{action.name} &lt;{action.email}&gt;</span>
                                </div>

                                {/* Subject */}
                                <div style={{
                                    padding: '6px 14px', borderBottom: '1px solid #f1f5f9',
                                    fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
                                }}>
                                    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Subj:</span>
                                    <span style={{ fontWeight: 500, color: '#334155' }}>
                                        {lastReceived?.subject
                                            ? (lastReceived.subject.startsWith('Re:') ? lastReceived.subject : `Re: ${lastReceived.subject}`)
                                            : lastSent?.subject
                                                ? (lastSent.subject.startsWith('Re:') ? lastSent.subject : `Re: ${lastSent.subject}`)
                                                : 'New conversation'}
                                    </span>
                                </div>

                                {/* Textarea */}
                                <textarea
                                    ref={textareaRef}
                                    value={replyBody}
                                    onChange={e => setReplyBody(e.target.value)}
                                    placeholder={
                                        action.actionType === 'REPLY_NOW'
                                            ? 'Write your reply...'
                                            : action.actionType === 'FOLLOW_UP'
                                                ? 'Write a follow-up message...'
                                                : action.actionType === 'WIN_BACK'
                                                    ? 'Write a re-engagement message...'
                                                    : 'Write your message...'
                                    }
                                    style={{
                                        width: '100%', minHeight: 100, padding: '12px 14px',
                                        border: 'none', outline: 'none', resize: 'vertical',
                                        fontSize: 13, lineHeight: 1.6, color: '#0f172a',
                                        fontFamily: "'DM Sans', system-ui, sans-serif",
                                        boxSizing: 'border-box',
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                />

                                {/* Send error */}
                                {sendError && (
                                    <div style={{
                                        padding: '8px 14px', background: '#fef2f2', color: '#dc2626',
                                        fontSize: 12, fontWeight: 500, borderTop: '1px solid #fecaca',
                                    }}>
                                        {sendError}
                                    </div>
                                )}

                                {/* Action bar */}
                                <div style={{
                                    padding: '8px 14px', borderTop: '1px solid #f1f5f9',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                    <button type="button" onClick={() => onQuickEmail(action)} style={{
                                        background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
                                        padding: '5px 10px', fontSize: 11, color: '#64748b', cursor: 'pointer',
                                        fontWeight: 500,
                                    }}>
                                        Use template
                                    </button>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                            {'\u2318'}+Enter to send
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleSend}
                                            disabled={!replyBody.trim() || !fromAccountId || sending}
                                            style={{
                                                background: (replyBody.trim() && fromAccountId) ? '#2563eb' : '#94a3b8',
                                                color: '#fff', border: 'none', borderRadius: 6,
                                                padding: '7px 16px', fontSize: 12, fontWeight: 600,
                                                cursor: (replyBody.trim() && fromAccountId) ? 'pointer' : 'not-allowed',
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                transition: 'background .15s', opacity: sending ? 0.7 : 1,
                                            }}
                                        >
                                            {sending ? (
                                                <><Loader2 size={13} className="action-spin" /> Sending...</>
                                            ) : (
                                                <><Send size={13} /> Send Reply</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
