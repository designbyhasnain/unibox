'use client';

import React from 'react';
import { CheckCheck, Check } from 'lucide-react';
import { avatarColor, formatDate, cleanPreview } from '../utils/helpers';
import AddProjectModal from './AddProjectModal';
import { ensureContactAction } from '../../src/actions/clientActions';

const STAGE_COLORS: Record<string, string> = {
    COLD_LEAD: 'badge-blue',
    LEAD: 'badge-yellow',
    OFFER_ACCEPTED: 'badge-green',
    CLOSED: 'badge-purple',
};

const STAGE_LABELS: Record<string, string> = {
    COLD_LEAD: 'Cold',
    LEAD: 'Lead',
    OFFER_ACCEPTED: 'Offer Accepted',
    CLOSED: 'Closed',
};


interface EmailRowProps {
    email: any;
    isSelected: boolean;
    isRowChecked: boolean;
    showBadge: boolean;
    onClick: () => void;
    onToggleSelect: (id: string) => void;
}

export function EmailRow({ email, isSelected, isRowChecked, showBadge, onClick, onToggleSelect }: EmailRowProps) {
    const senderRaw = email.from_email || '';
    const senderName = senderRaw.split('<')[0].trim() || senderRaw.split('@')[0] || 'Unknown';
    const stage = email.pipeline_stage;
    const preview = cleanPreview(email.snippet || email.body || '');

    return (
        <div
            className={`universal-grid grid-inbox grid-row ${email.is_unread ? 'unread' : ''} ${isSelected ? 'selected' : ''}`}
            onClick={onClick}
        >
            <div className="grid-col col-main" style={{ display: 'flex', alignItems: 'center' }}>
                <label className="check-container" onClick={(e) => e.stopPropagation()} style={{ margin: 0 }}>
                    <input
                        type="checkbox"
                        checked={isRowChecked}
                        onChange={() => onToggleSelect(email.id)}
                    />
                    <span className="checkmark" />
                </label>
            </div>

            <div className="grid-col col-main">
                <div className="sender-name">{senderName}</div>
            </div>

            <div className="grid-col col-main" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span className="subject-text" style={{ color: email.is_unread ? 'white' : 'var(--text-primary)', fontWeight: email.is_unread ? 700 : 500 }}>{email.subject}</span>
                {/* Preview hidden to keep list clean */}

                {showBadge && (
                    <span className={`badge ${stage ? STAGE_COLORS[stage] : 'badge-blue'}`} style={{ marginLeft: 'auto', fontSize: '13px' }}>
                        {stage ? STAGE_LABELS[stage] : (email.is_unread ? 'New' : 'Cold')}
                    </span>
                )}
            </div>

            <div className="grid-col secondary">
                {email.gmail_accounts?.email || '-'}
            </div>

            <div className="grid-col" style={{ color: 'var(--text-accent)', fontSize: '0.8125rem' }}>
                {email.gmail_accounts?.user?.name || 'Unassigned'}
            </div>

            <div className="grid-col right muted" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                {formatDate(email.sent_at)}
            </div>
        </div>
    );
}

// ─── Email Detail Panel ────────────────────────────────────────────────────────

interface EmailDetailProps {
    email: any;
    threadMessages: any[];
    isThreadLoading: boolean;
    isReplyingInline: boolean;
    onBack: () => void;
    onStageChange: (messageId: string, stage: string) => void;
    onReply: () => void;
    onForward: () => void;
    onNotInterested?: (email: string) => void;
    onNotSpam?: (messageId: string) => void;
    replySlot?: React.ReactNode;
}

const STAGE_OPTIONS = [
    { id: 'COLD_LEAD', label: 'Cold' },
    { id: 'LEAD', label: 'Lead' },
    { id: 'OFFER_ACCEPTED', label: 'Offer Accepted' },
    { id: 'CLOSED', label: 'Closed' },
];

/** Safely render HTML email body inside a sandboxed iframe for Gmail-like fidelity */
function EmailBodyFrame({ html }: { html: string }) {
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = React.useState(200);

    React.useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        // Build a full HTML document for the iframe so images/links render correctly
        const sanitized = (html || '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
            .replace(/on\w+\s*=\s*'[^']*'/gi, '');

        const doc = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    * { box-sizing: border-box; }
                    body {
                        margin: 0;
                        padding: 24px;
                        font-family: 'Google Sans', 'Segoe UI', Roboto, Arial, sans-serif;
                        font-size: 14px;
                        line-height: 1.6;
                        color: #202124;
                        background: #fff;
                        word-break: break-word;
                        -webkit-font-smoothing: antialiased;
                    }
                    img {
                        max-width: 100% !important;
                        height: auto !important;
                        display: inline-block;
                    }
                    a {
                        color: #1a73e8;
                        text-decoration: none;
                    }
                    a:hover { text-decoration: underline; }
                    table {
                        max-width: 100% !important;
                    }
                    blockquote {
                        margin: 0 0 0 0.8ex;
                        border-left: 1px solid #ccc;
                        padding-left: 1ex;
                        color: #5f6368;
                    }
                    pre, code {
                        background: #f1f3f4;
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-size: 13px;
                    }
                    pre { padding: 12px; overflow-x: auto; }
                    hr { border: none; border-top: 1px solid #e0e0e0; margin: 16px 0; }
                </style>
            </head>
            <body>${sanitized}</body>
            </html>
        `;

        iframe.srcdoc = doc;

        const resizeHandler = () => {
            try {
                const body = iframe.contentDocument?.body;
                const html = iframe.contentDocument?.documentElement;
                if (body && html) {
                    const h = Math.max(body.scrollHeight, html.scrollHeight, 100);
                    setHeight(h + 32);
                }
            } catch { }
        };

        iframe.addEventListener('load', () => {
            resizeHandler();
            // Also make links open in new tab
            try {
                const links = iframe.contentDocument?.querySelectorAll('a');
                links?.forEach(link => {
                    link.setAttribute('target', '_blank');
                    link.setAttribute('rel', 'noopener noreferrer');
                });
            } catch { }
        });

        // Fallback resize
        const timer = setTimeout(resizeHandler, 500);
        return () => clearTimeout(timer);
    }, [html]);

    return (
        <iframe
            ref={iframeRef}
            className="email-body-iframe"
            style={{ width: '100%', height: `${height}px`, border: 'none', borderRadius: '8px', background: '#fff' }}
            sandbox="allow-same-origin allow-popups"
            title="Email content"
        />
    );
}

/** Plain text body renderer with clickable link detection */
function PlainTextBody({ text }: { text: string }) {
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    const parts = text.split(urlRegex);

    return (
        <div className="plain-text-body">
            {parts.map((part, i) =>
                urlRegex.test(part) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="email-link">
                        {part}
                    </a>
                ) : (
                    <React.Fragment key={i}>{part}</React.Fragment>
                )
            )}
        </div>
    );
}

function formatFullDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function extractSenderName(rawFrom: string): string {
    const parts = (rawFrom || '').split('<');
    const name = (parts[0] ?? '').trim().replace(/"/g, '');
    if (name && name !== rawFrom) return name;
    const emailParts = (rawFrom || '').split('@');
    return (emailParts[0] ?? '') || 'Unknown';
}

function extractEmail(rawFrom: string): string {
    const match = rawFrom?.match(/<([^>]+)>/);
    return match?.[1] || rawFrom || '';
}

function isHtmlBody(body: string): boolean {
    if (!body) return false;
    return /<(html|div|p|table|span|br|img|a|style|head|body|td|tr)\b/i.test(body);
}

function MessageDetailsPopover({ msg }: { msg: any }) {
    const fromName = extractSenderName(msg.from_email || '');
    const fromEmail = extractEmail(msg.from_email || '');
    const domain = fromEmail.split('@')[1] || 'gmail.com';

    return (
        <div className="gmail-msg-popover" onClick={(e) => e.stopPropagation()}>
            <div className="popover-row">
                <span className="popover-label">from:</span>
                <span className="popover-value">
                    <strong>{fromName}</strong> &lt;{fromEmail}&gt;
                </span>
            </div>
            <div className="popover-row">
                <span className="popover-label">to:</span>
                <span className="popover-value">{msg.to_email || 'undisclosed-recipients'}</span>
            </div>
            <div className="popover-row">
                <span className="popover-label">date:</span>
                <span className="popover-value">{formatFullDate(msg.sent_at)}</span>
            </div>
            <div className="popover-row">
                <span className="popover-label">subject:</span>
                <span className="popover-value">{msg.subject}</span>
            </div>
            <div className="popover-row">
                <span className="popover-label">mailed-by:</span>
                <span className="popover-value">{domain}</span>
            </div>
            <div className="popover-row">
                <span className="popover-label">signed-by:</span>
                <span className="popover-value">{domain}</span>
            </div>
            <div className="popover-row">
                <span className="popover-label">security:</span>
                <span className="popover-value">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a73e8" strokeWidth="2.5">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Standard encryption (TLS)
                        <span style={{ color: 'var(--accent)', cursor: 'pointer', marginLeft: '4px' }}>Learn more</span>
                    </div>
                </span>
            </div>
        </div>
    );
}


export function EmailDetail({
    email,
    threadMessages,
    isThreadLoading,
    isReplyingInline,
    onBack,
    onStageChange,
    onReply,
    onForward,
    onNotInterested,
    onNotSpam,
    replySlot,
}: EmailDetailProps) {
    const [collapsedThreads, setCollapsedThreads] = React.useState<Set<string>>(new Set());
    const [openDetailsId, setOpenDetailsId] = React.useState<string | null>(null);
    const [isAddProjectOpen, setIsAddProjectOpen] = React.useState(false);
    const [targetClient, setTargetClient] = React.useState<any>(null);
    const [isCreatingProject, setIsCreatingProject] = React.useState(false);
    const [openMoreId, setOpenMoreId] = React.useState<string | null>(null);

    React.useEffect(() => {
        const handleClickOutside = () => {
            setOpenDetailsId(null);
            setOpenMoreId(null);
        };
        if (openDetailsId) {
            window.addEventListener('click', handleClickOutside);
        }
        return () => window.removeEventListener('click', handleClickOutside);
    }, [openDetailsId]);

    // On new email, collapse all threads except the latest
    React.useEffect(() => {
        if (threadMessages.length > 1) {
            const toCollapse = new Set<string>();
            threadMessages.slice(0, -1).forEach(m => toCollapse.add(m.id));
            setCollapsedThreads(toCollapse);
        } else {
            setCollapsedThreads(new Set());
        }
    }, [email?.id]);

    const toggleCollapse = (id: string) => {
        setCollapsedThreads(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleCreateProjectClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const contactId = email.contact_id;
        const senderMail = extractEmail(email.from_email);
        const nameRaw = extractSenderName(email.from_email);

        setIsCreatingProject(true);
        // Ensure contact exists because projects table requires a client_id (FK)
        const contact = await ensureContactAction(senderMail, nameRaw);
        setIsCreatingProject(false);

        if (contact) {
            setTargetClient(contact);
            setIsAddProjectOpen(true);
        } else {
            alert("Could not find or create a contact for this project.");
        }
    };

    return (
        <div className="detail-panel">
            {/* ─── Gmail-style Toolbar ─── */}
            <div className="gmail-toolbar">
                <div className="gmail-toolbar-left">
                    <button className="gmail-toolbar-btn" onClick={onBack} title="Back to inbox">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    </button>


                    {onNotSpam && (
                        <button
                            className="gmail-toolbar-btn"
                            style={{ marginLeft: '8px', borderLeft: '1px solid var(--border-color)', paddingLeft: '12px', borderRadius: 0 }}
                            onClick={() => onNotSpam(email.id)}
                            title="Not Spam / Move to Inbox"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                            </svg>
                        </button>
                    )}

                    {onNotInterested && (
                        <button
                            className="gmail-toolbar-btn danger"
                            style={{ marginLeft: '8px', borderLeft: '1px solid var(--border-color)', paddingLeft: '12px', borderRadius: 0 }}
                            onClick={() => onNotInterested(extractEmail(email.from_email))}
                            title="Not Interested / Hide Sender"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                            </svg>
                        </button>
                    )}

                    <button
                        className="btn btn-primary sm"
                        style={{ marginLeft: '12px', opacity: isCreatingProject ? 0.7 : 1, display: 'flex', alignItems: 'center' }}
                        onClick={handleCreateProjectClick}
                        disabled={isCreatingProject}
                    >
                        {isCreatingProject ? <div className="spinner-tiny" style={{ marginRight: 6 }} /> : (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                        )}
                        New Project
                    </button>
                </div>

                <div className="gmail-toolbar-right">
                    <div className="gmail-stage-selector">
                        <span className="gmail-stage-label">Stage</span>
                        <select
                            className="stage-select"
                            value={email.pipeline_stage || 'COLD_LEAD'}
                            onChange={(e) => onStageChange(email.id, e.target.value)}
                        >
                            {STAGE_OPTIONS.map((t) => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* ─── Subject Line ─── */}
            <div className="gmail-subject-bar">
                <h1 className="gmail-subject">{email.subject || '(No Subject)'}</h1>
                <span className={`badge ${email.pipeline_stage ? STAGE_COLORS[email.pipeline_stage] : 'badge-blue'}`}>
                    {email.pipeline_stage
                        ? (STAGE_LABELS[email.pipeline_stage] || email.pipeline_stage)
                        : (email.is_unread ? 'New' : 'Cold')
                    }
                </span>
            </div>

            {/* ─── Thread Container ─── */}
            <div className="gmail-thread-body">
                {isThreadLoading && threadMessages.length <= 1 ? (
                    <div className="empty-state" style={{ padding: '4rem' }}>
                        <div className="spinner" />
                    </div>
                ) : (
                    <div className="gmail-thread-list">
                        {threadMessages.map((msg, idx) => {
                            const isLast = idx === threadMessages.length - 1;
                            const isCollapsed = collapsedThreads.has(msg.id) && !isLast;
                            const senderName = msg.direction === 'SENT' ? 'me' : extractSenderName(msg.from_email || '');
                            const senderEmail = msg.direction === 'SENT' ? email.to_email : extractEmail(msg.from_email || '');
                            const isHtml = isHtmlBody(msg.body || '');

                            return (
                                <div key={msg.id} className={`gmail-message ${isCollapsed ? 'collapsed' : 'expanded'} ${isLast ? 'last' : ''}`}>
                                    {/* ─── Message Header ─── */}
                                    <div
                                        className="gmail-msg-header"
                                        onClick={!isLast ? () => toggleCollapse(msg.id) : undefined}
                                        style={!isLast ? { cursor: 'pointer' } : {}}
                                    >
                                        <div
                                            className="gmail-avatar"
                                            style={{
                                                background: msg.direction === 'SENT'
                                                    ? 'linear-gradient(135deg, #4f8cff, #6366f1)'
                                                    : avatarColor(msg.from_email || 'x'),
                                            }}
                                        >
                                            {msg.direction === 'SENT' ? 'Me' : (senderName.charAt(0) || '?').toUpperCase()}
                                        </div>

                                        <div className="gmail-msg-info">
                                            <div className="gmail-msg-top-row">
                                                <span className="gmail-sender-name">{senderName}</span>
                                                {isCollapsed && (
                                                    <span className="gmail-snippet">
                                                        — {cleanPreview(msg.snippet || msg.body || '')}
                                                    </span>
                                                )}
                                            </div>
                                            {!isCollapsed && (
                                                <div className="gmail-msg-meta">
                                                    <div
                                                        className="gmail-meta-details-trigger"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenDetailsId(openDetailsId === msg.id ? null : msg.id);
                                                        }}
                                                    >
                                                        <span className="gmail-meta-to">
                                                            to {msg.direction === 'SENT' ? (msg.to_email || 'recipient') : 'me'}
                                                        </span>
                                                        <svg
                                                            width="12"
                                                            height="12"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2.5"
                                                            className={`details-arrow ${openDetailsId === msg.id ? 'open' : ''}`}
                                                        >
                                                            <path d="M6 9l6 6 6-6" />
                                                        </svg>
                                                    </div>
                                                    {openDetailsId === msg.id && (
                                                        <MessageDetailsPopover msg={msg} />
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="gmail-msg-date">
                                            <span className="gmail-date-text" title={formatFullDate(msg.sent_at)}>
                                                {formatDate(msg.sent_at)}
                                            </span>
                                            {!isCollapsed && !isLast && (
                                                <span className="gmail-date-full">
                                                    {formatFullDate(msg.sent_at)}
                                                </span>
                                            )}
                                        </div>

                                        {!isCollapsed && (
                                            <div className="gmail-msg-actions">
                                                <button className="gmail-action-btn" title="Reply" onClick={(e) => { e.stopPropagation(); onReply(); }}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17L4 12l5-5M4 12h16" /></svg>
                                                </button>
                                                <div style={{ position: 'relative' }}>
                                                    <button
                                                        className="gmail-action-btn"
                                                        title="More options"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenMoreId(openMoreId === msg.id ? null : msg.id);
                                                            setOpenDetailsId(null);
                                                        }}
                                                    >
                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
                                                    </button>
                                                    {openMoreId === msg.id && (
                                                        <div className="gmail-msg-popover more-options" style={{ top: '100%', right: 0, left: 'auto', width: '180px', padding: '6px 0' }}>
                                                            <div className="popover-action-item" onClick={async () => {
                                                                const { markEmailAsUnreadAction } = await import('../../src/actions/emailActions');
                                                                await markEmailAsUnreadAction(msg.id);
                                                                setOpenMoreId(null);
                                                            }}>
                                                                Mark as unread
                                                            </div>
                                                            <div className="popover-action-item" onClick={async () => {
                                                                if (confirm('Delete this message?')) {
                                                                    const { deleteEmailAction } = await import('../../src/actions/emailActions');
                                                                    await deleteEmailAction(msg.id);
                                                                    setOpenMoreId(null);
                                                                    onBack();
                                                                }
                                                            }}>
                                                                Delete this message
                                                            </div>
                                                            <div className="popover-separator" />
                                                            <div className="popover-action-item" onClick={() => { window.print(); setOpenMoreId(null); }}>
                                                                Print
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>


                                    {/* ─── Message Body ─── */}
                                    {!isCollapsed && (
                                        <div className="gmail-msg-body">

                                            {isHtml ? (
                                                <EmailBodyFrame
                                                    html={(msg.body || '')
                                                        .replace(/<img /gi, '<img referrerpolicy="no-referrer" ')
                                                        .replace(/data-src=/gi, 'src=')
                                                        .replace(/<!-- ATTACHMENTS: [\s\S]*? -->/g, '')}
                                                />
                                            ) : (
                                                <PlainTextBody text={(msg.body || '').replace(/<!-- ATTACHMENTS: [\s\S]*? -->/g, '')} />
                                            )}

                                            {/* Attachments */}
                                            {msg.body?.includes('<!-- ATTACHMENTS:') && (
                                                <div className="gmail-attachments">
                                                    {(() => {
                                                        const match = msg.body.match(/<!-- ATTACHMENTS: ([\s\S]*?) -->/);
                                                        if (!match) return null;
                                                        try {
                                                            const atts = JSON.parse(match[1]);
                                                            return atts.map((a: any) => (
                                                                <div key={a.id} className="gmail-attachment-chip">
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                                                                    <span>{a.filename || 'Attachment'}</span>
                                                                    <span className="gmail-att-size">{a.size ? `${(a.size / 1024).toFixed(0)} KB` : ''}</span>
                                                                </div>
                                                            ));
                                                        } catch { return null; }
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ─── Reply Footer ─── */}
            <div className="gmail-reply-footer">
                {isReplyingInline ? (
                    replySlot
                ) : (
                    <div className="gmail-reply-buttons">
                        <button className="gmail-reply-btn" onClick={onReply} id="reply-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17L4 12l5-5M4 12h16" /></svg>
                            Reply
                        </button>
                        <button className="gmail-reply-btn" onClick={onForward} id="forward-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 17l5-5-5-5M20 12H4" /></svg>
                            Forward
                        </button>
                    </div>
                )}
            </div>
            {isAddProjectOpen && targetClient && (
                <AddProjectModal
                    client={targetClient}
                    initialProjectName={email.subject}
                    sourceEmailId={email.id}
                    onClose={() => setIsAddProjectOpen(false)}
                    onCreated={() => {
                        setIsAddProjectOpen(false);
                        alert("Project created successfully!");
                    }}
                />
            )}
        </div>
    );
}


// ─── Pagination Controls ───────────────────────────────────────────────────────

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
    onGoToPage: (page: number) => void;
}

export function PaginationControls({ currentPage, totalPages, totalCount, pageSize, onGoToPage }: PaginationProps) {
    if (totalPages <= 1) return null;

    const getPageNumbers = (): (number | '...')[] => {
        const pages: (number | '...')[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 3) pages.push('...');
            for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
            if (currentPage < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        return pages;
    };

    return (
        <div className="pagination">
            <span className="count-label">
                {totalCount > 0
                    ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, totalCount)} of ${totalCount.toLocaleString()}`
                    : ''}
            </span>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <button
                    className="page-btn"
                    onClick={() => onGoToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>
                {getPageNumbers().map((p, i) =>
                    p === '...' ? (
                        <span key={`ellipsis-${i}`} style={{ color: 'var(--text-muted)', padding: '0 4px', fontSize: '0.75rem' }}>…</span>
                    ) : (
                        <button
                            key={p}
                            className={`page-btn ${p === currentPage ? 'active' : ''}`}
                            onClick={() => onGoToPage(p as number)}
                        >
                            {p}
                        </button>
                    )
                )}
                <button
                    className="page-btn"
                    onClick={() => onGoToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

// ─── Toast Notification ────────────────────────────────────────────────────────

interface ToastItem { id: string; subject: string; from: string; }

interface ToastStackProps {
    toasts: ToastItem[];
    onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
    if (toasts.length === 0) return null;
    return (
        <div className="toast-stack">
            {toasts.map((toast) => (
                <div key={toast.id} className="toast">
                    <div className="toast-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth="2">
                            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="toast-label">New email</div>
                        <div className="toast-title">{toast.subject}</div>
                        <div className="toast-sub">from {toast.from}</div>
                    </div>
                    <button className="toast-close" onClick={() => onDismiss(toast.id)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
}
