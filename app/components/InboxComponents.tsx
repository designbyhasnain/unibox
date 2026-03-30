'use client';

import React from 'react';
import { CheckCheck } from 'lucide-react';
import { avatarColor, formatDate, cleanPreview } from '../utils/helpers';
import AddProjectModal from './AddProjectModal';
import { useHydrated } from '../utils/useHydration';
import { ensureContactAction } from '../../src/actions/clientActions';

import { STAGE_COLORS, STAGE_LABELS, STAGE_OPTIONS } from '../constants/stages';


interface EmailRowProps {
    email: any;
    isSelected: boolean;
    isRowChecked: boolean;
    showBadge: boolean;
    onClick: () => void;
    onToggleSelect: (id: string) => void;
    onPrefetch?: () => void;
}

export const EmailRow = React.memo(function EmailRow({
    email, isSelected, isRowChecked, showBadge, onClick, onToggleSelect, onPrefetch
}: EmailRowProps) {
    const prefetchTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
    const handleMouseEnter = React.useCallback(() => {
        if (!onPrefetch) return;
        prefetchTimer.current = setTimeout(onPrefetch, 150);
    }, [onPrefetch]);
    const handleMouseLeave = React.useCallback(() => {
        clearTimeout(prefetchTimer.current);
    }, []);

    let senderName = 'Unknown';
    if (email.direction === 'SENT') {
        const toRaw = email.to_email || '';
        const toNameMatch = toRaw.split(',')[0]?.match(/^([^<]+)</);
        const toName = toNameMatch ? toNameMatch[1]?.trim().replace(/"/g, '') : toRaw.split('@')[0];
        senderName = `To: ${toName || 'Unknown'}`;
    } else {
        const fromRaw = email.from_email || '';
        const fromNameMatch = fromRaw.match(/^([^<]+)</);
        const fromName = fromNameMatch ? fromNameMatch[1]?.trim().replace(/"/g, '') : fromRaw.split('@')[0];
        senderName = fromName || 'Unknown';
    }
    const stage = email.pipeline_stage;
    const preview = cleanPreview(email.snippet || email.body || '');
    const isUnread = email.is_unread;

    const isHydrated = useHydrated();

    const subject = email.subject || '(no subject)';
    const accountEmail = email.gmail_accounts?.email || '';
    const managerName = email.gmail_accounts?.user?.name || '';
    const dateStr = formatDate(email.sent_at);

    return (
        <div
            className={`gmail-email-row ${isUnread ? 'unread' : 'read'} ${isSelected ? 'selected' : ''}`}
            onClick={onClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            role="row"
            aria-label={`Email from ${senderName} - ${subject}`}
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
        >
            {/* Checkbox */}
            <div
                className="gmail-row-check"
                onClick={(e) => e.stopPropagation()}
                role="checkbox"
                aria-checked={isRowChecked}
                aria-label={`Select email from ${senderName}`}
            >
                <label className="check-container" style={{ margin: 0 }}>
                    <input
                        type="checkbox"
                        checked={isRowChecked}
                        onChange={() => onToggleSelect(email.id)}
                        tabIndex={-1}
                    />
                    <span className="checkmark" />
                </label>
            </div>

            {/* Star */}
            <div className="gmail-row-star" onClick={(e) => e.stopPropagation()} role="button" aria-label="Star email" tabIndex={-1}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" style={{ cursor: 'pointer', display: 'block' }}>
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
            </div>

            {/* Sender — flex with min-width for truncation */}
            <div className="gmail-row-sender" title={senderName}>
                {senderName}
            </div>

            {/* Subject + Preview + Badge — flex grow */}
            <div className="gmail-row-body">
                <span className="gmail-row-subject" title={subject}>{subject}</span>
                {preview && (
                    <>
                        <span className="gmail-row-dash"> – </span>
                        <span className="gmail-row-preview" title={preview}>{preview}</span>
                    </>
                )}
                {showBadge && (
                    <span className={`badge gmail-row-badge ${stage ? STAGE_COLORS[stage] : 'badge-blue'}`}>
                        {stage ? STAGE_LABELS[stage] : 'Cold'}
                    </span>
                )}
            </div>

            {/* WhatsApp-style ticks: sent=double grey, opened=double blue */}
            {email.direction === 'SENT' && (
                <div className="gmail-row-tracking">
                    {email.opened_at ? (
                        <div className="tracking-tick-blue">
                            <CheckCheck size={16} color="var(--accent)" strokeWidth={3} />
                        </div>
                    ) : (
                        <div className="tracking-tick">
                            <CheckCheck size={16} color="var(--text-tertiary)" strokeWidth={2.5} />
                        </div>
                    )}
                </div>
            )}

            {/* Gmail Account */}
            <div className="gmail-row-account" title={accountEmail}>
                {accountEmail}
            </div>

            {/* Manager */}
            <div className="gmail-row-manager" title={managerName}>
                {managerName}
            </div>

            {/* Date */}
            <div className="gmail-row-date" title={dateStr}>
                {dateStr}
            </div>

            <style jsx>{`
                .gmail-row-sender {
                    flex: 0 0 220px;
                    min-width: 0;
                }
                .gmail-row-account {
                    flex: 0 0 220px;
                    min-width: 0;
                }
                .gmail-row-tracking {
                    min-width: 40px;
                    gap: 4px;
                }
                .tracking-tick-blue,
                .tracking-tick {
                    display: flex;
                    align-items: center;
                    gap: 3px;
                }
            `}</style>
        </div>
    );
}, (prev, next) => {
    return (
        prev.email.id === next.email.id &&
        prev.email.is_unread === next.email.is_unread &&
        prev.email.pipeline_stage === next.email.pipeline_stage &&
        prev.email.opened_at === next.email.opened_at &&
        prev.email.has_reply === next.email.has_reply &&
        prev.isSelected === next.isSelected &&
        prev.isRowChecked === next.isRowChecked &&
        prev.showBadge === next.showBadge
    );
});

/* SkeletonRow removed - moved to LoadingStates.tsx for universal use */

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
    onNotInterested?: ((email: string) => void) | undefined;
    onNotSpam?: ((messageId: string) => void) | undefined;
    replySlot?: React.ReactNode;
    onDelete?: () => void;
    totalCount?: number;
}

// Moved to app/constants/stages.ts for universal architecture

/** Safely render HTML email body inside a sandboxed iframe for Gmail-like fidelity */
function EmailBodyFrame({ html }: { html: string }) {
    const iframeRef = React.useRef<HTMLIFrameElement>(null);
    const observerRef = React.useRef<MutationObserver | null>(null);
    const [height, setHeight] = React.useState(200);

    React.useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        // Safety: Limit sanitization processing for massive HTML to prevent hangs
        const rawContent = html || '';
        const toSanitize = rawContent.length > 800000 ? rawContent.substring(0, 800000) : rawContent;

        const sanitized = toSanitize
            // Strip ALL tracking pixel images (any img containing api/track)
            .replace(/<img[^>]*api\/track[^>]*>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
            .replace(/<iframe[^>]*\/?\s*>/gi, '')
            .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
            .replace(/on\w+\s*=\s*'[^']*'/gi, '')
            .replace(/on\w+\s*=\s*[^\s>]+/gi, '')
            .replace(/href\s*=\s*["']?\s*javascript\s*:/gi, 'href="')
            .replace(/src\s*=\s*["']?\s*javascript\s*:/gi, 'src="')
            .replace(/href\s*=\s*["']?\s*data\s*:\s*text\/html/gi, 'href="')
            .replace(/src\s*=\s*["']?\s*data\s*:\s*text\/html/gi, 'src="')
            .replace(/expression\s*\(/gi, 'blocked(')
            .replace(/url\s*\(\s*["']?\s*javascript\s*:/gi, 'url(blocked:');

        // Inject a postMessage-based resize script so height auto-adjusts even with sandbox
        const resizeScript = `
            <script>
                function notifyHeight() {
                    var h = Math.max(
                        document.body.scrollHeight,
                        document.body.offsetHeight,
                        document.documentElement.scrollHeight,
                        document.documentElement.offsetHeight
                    );
                    window.parent.postMessage({ type: 'iframe-resize', height: h }, '*');
                }
                window.addEventListener('load', function() {
                    notifyHeight();
                    setTimeout(notifyHeight, 300);
                    setTimeout(notifyHeight, 1000);
                    setTimeout(notifyHeight, 3000);
                });
                new MutationObserver(notifyHeight).observe(document.body, { childList: true, subtree: true, attributes: true });
                // Also observe images loading
                document.addEventListener('load', function(e) {
                    if (e.target && e.target.tagName === 'IMG') notifyHeight();
                }, true);
            </script>
        `;

        // Block tracking pixel from loading inside the iframe by replacing src with empty
        const pixelSafe = sanitized.replace(/src=["'][^"']*api\/track[^"']*["']/gi, 'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"');

        const doc = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    * { box-sizing: border-box; }
                    html, body { height: auto !important; overflow: visible !important; }
                    body {
                        margin: 0;
                        padding: 16px 24px;
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
            <body>
                ${pixelSafe}
                ${resizeScript}
            </body>
            </html>
        `;

        iframe.srcdoc = doc;

        // Listen for postMessage-based resize from iframe
        const messageHandler = (e: MessageEvent) => {
            if (e.data?.type === 'iframe-resize' && typeof e.data.height === 'number') {
                // Only update if this message came from our iframe
                if (e.source === iframe.contentWindow) {
                    setHeight(Math.max(e.data.height + 16, 100));
                }
            }
        };
        window.addEventListener('message', messageHandler);

        // Also try direct access (works when allow-same-origin is present)
        const resizeHandler = () => {
            try {
                const body = iframe.contentDocument?.body;
                const docEl = iframe.contentDocument?.documentElement;
                if (body && docEl) {
                    const h = Math.max(body.scrollHeight, body.offsetHeight, docEl.scrollHeight, docEl.offsetHeight, 100);
                    setHeight(h + 16);
                }
            } catch { }
        };

        const loadHandler = () => {
            resizeHandler();
            try {
                if (observerRef.current) {
                    observerRef.current.disconnect();
                    observerRef.current = null;
                }
                const b = iframe.contentDocument?.body;
                if (b) {
                    const observer = new MutationObserver(resizeHandler);
                    observer.observe(b, { childList: true, subtree: true, attributes: true });
                    observerRef.current = observer;
                }
            } catch { }

            // Make links open in new tab
            try {
                const links = iframe.contentDocument?.querySelectorAll('a');
                links?.forEach(link => {
                    link.setAttribute('target', '_blank');
                    link.setAttribute('rel', 'noopener noreferrer');
                });
            } catch { }
        };

        iframe.addEventListener('load', loadHandler);

        const timer = setTimeout(resizeHandler, 500);
        return () => {
            clearTimeout(timer);
            iframe.removeEventListener('load', loadHandler);
            window.removeEventListener('message', messageHandler);
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
        };
    }, [html]);

    return (
        <iframe
            ref={iframeRef}
            className="email-body-iframe"
            style={{ width: '100%', height: `${height}px`, border: 'none', background: '#fff' }}
            sandbox="allow-popups allow-same-origin allow-scripts"
            title="Email content"
        />
    );
}

/** Plain text body renderer with clickable link detection */
function PlainTextBody({ text }: { text: string }) {
    return (
        <div className="plain-text-body">
            <TextWithLinks text={text} />
        </div>
    );
}

function TextWithLinks({ text }: { text: string }) {
    const urlRegexGlobal = /(https?:\/\/[^\s<]+)/g;
    const urlRegexTest = /^https?:\/\/[^\s<]+$/;
    const parts = text.split(urlRegexGlobal);
    return (
        <>
            {parts.map((part, i) =>
                urlRegexTest.test(part) ? (
                    <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="email-link">
                        {part}
                    </a>
                ) : (
                    <React.Fragment key={i}>{part}</React.Fragment>
                )
            )}
        </>
    );
}

function formatFullDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now.getTime() - then.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
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

export function stripOldEmailContent(body: string, isHtml: boolean): string {
    if (!body) return '';
    
    // Safety: If the body is extremely large (e.g. 500KB+), processing it with multiple 
    // complex regexes can hang the main thread (Page Unresponsive).
    // We truncate it for cleaning, or skip cleaning if it's too massive to be a normal text chain.
    if (body.length > 500000) return body; 

    let cleaned = body;

    // Remove attachments placeholder from body text before checking lengths
    cleaned = cleaned.replace(/<!-- ATTACHMENTS: [\s\S]*? -->/gi, '');

    const breakPoints = [
        '<div class="gmail_quote"',
        '<div class="yahoo_quoted"',
        '<blockquote type="cite"',
        '<div class="x_gmail_quote"',
        '<div dir="ltr" class="gmail_attr"',
        ' id="appendonsend"'
    ];

    if (isHtml) {
        let minIndex = cleaned.length;
        for (const point of breakPoints) {
            const idx = cleaned.indexOf(point);
            if (idx !== -1 && idx < minIndex) {
                minIndex = idx;
            }
        }
        if (minIndex < cleaned.length) {
            cleaned = cleaned.substring(0, minIndex);
        }

        const onWroteRegex = /(?:^|>|\n|\r)\s*On\s+(?:(?!\bOn\b)[\s\S]){10,400}?(?:wrote|schreef|escribió):/i;
        const match = cleaned.match(onWroteRegex);
        if (match && match.index !== undefined && match.index > 0) {
            cleaned = cleaned.substring(0, match.index);
        }

        const dividerRegex = /-{5,}\s*Original Message\s*-{5,}/i;
        const divMatch = cleaned.match(dividerRegex);
        if (divMatch && divMatch.index !== undefined && divMatch.index > 0) {
            cleaned = cleaned.substring(0, divMatch.index);
        }

        const outlookHr = cleaned.match(/<hr[^>]*tabindex="-1"[^>]*>/i);
        if (outlookHr && outlookHr.index !== undefined && outlookHr.index > 0) {
            cleaned = cleaned.substring(0, outlookHr.index);
        }
    } else {
        const plainRegex = /(?:^|\n|\r)\s*On\s+(?:(?!\bOn\b)[\s\S]){10,400}?(?:wrote|schreef|escribió):/i;
        const match = cleaned.match(plainRegex);
        if (match && match.index !== undefined && match.index > 0) {
            cleaned = cleaned.substring(0, match.index);
        }

        const plainDivider = /(?:\r?\n\s*)*-{5,}\s*Original Message\s*-{5,}/i;
        const divMatch = cleaned.match(plainDivider);
        if (divMatch && divMatch.index !== undefined && divMatch.index > 0) {
            cleaned = cleaned.substring(0, divMatch.index);
        }

        const underscoreDivider = /(?:\r?\n\s*)*_{10,}/;
        const hrMatch = cleaned.match(underscoreDivider);
        if (hrMatch && hrMatch.index !== undefined && hrMatch.index > 0) {
            cleaned = cleaned.substring(0, hrMatch.index);
        }
    }

    const result = cleaned.trim();
    
    // Safety Fallback: if stripping removed EVERYTHING or nearly everything but we had content, 
    // it likely means the regex was too aggressive or the email is only a quote.
    // In that case, showing the full content is better than showing nothing.
    // We also check if the result is just empty HTML noise.
    const hasVisibleText = result.replace(/<[^>]*>/g, '').trim().length > 0;

    if ((!result || !hasVisibleText) && body.trim().length > 0) {
        return body.trim();
    }

    return result;
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
                    <div className="flex-center-gap-sm">
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5">
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
    onDelete,
    totalCount = 0,
}: EmailDetailProps) {
    const isHydrated = useHydrated();
    const [showAllIntermediate, setShowAllIntermediate] = React.useState(false);
    const [collapsedThreads, setCollapsedThreads] = React.useState<Set<string>>(new Set());
    const [isAllExpanded, setIsAllExpanded] = React.useState(false);
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

    // On new email, intelligently collapse threads, keeping unread inner messages expanded
    React.useEffect(() => {
        let hasUnreadIntermediate = false;
        if (threadMessages.length > 1) {
            const toCollapse = new Set<string>();
            threadMessages.forEach((m, i) => {
                const isLast = i === threadMessages.length - 1;
                // Collapse read messages except the very last one
                if (!isLast && !m.is_unread) {
                    toCollapse.add(m.id);
                }
                // Mark if any intermediate msg is unread so we expand them out of the badge by default
                if (i > 0 && i < threadMessages.length - 1 && m.is_unread) {
                    hasUnreadIntermediate = true;
                }
            });
            setCollapsedThreads(toCollapse);
        } else {
            setCollapsedThreads(new Set());
        }
        setIsAllExpanded(false);
        setShowAllIntermediate(hasUnreadIntermediate);
    }, [email?.id, threadMessages.length]);

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
                    <button className="gmail-toolbar-btn" onClick={onBack} title="Back to inbox" aria-label="Back to inbox">
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    </button>

                    <button className="gmail-toolbar-btn" title="Delete" aria-label="Delete email" onClick={async () => {
                        if (window.confirm('Delete this email?')) {
                            const { deleteEmailAction } = await import('../../src/actions/emailActions');
                            await deleteEmailAction(email.id);
                            onBack();
                        }
                    }}>
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                        </svg>
                    </button>

                    {onNotSpam && email?.pipeline_stage === 'SPAM' && (
                        <button
                            className="gmail-toolbar-btn"
                            style={{ marginLeft: '8px', borderLeft: '1px solid var(--border-color)', paddingLeft: '12px', borderRadius: 0 }}
                            onClick={() => onNotSpam(email.id)}
                            title="Not Spam / Move to Inbox"
                            aria-label="Not Spam - Move to Inbox"
                        >
                            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" />
                            </svg>
                        </button>
                    )}

                    {onNotInterested && email?.pipeline_stage !== 'NOT_INTERESTED' && (
                        <button
                            className="gmail-toolbar-btn danger"
                            style={{ marginLeft: '8px', borderLeft: '1px solid var(--border-color)', paddingLeft: '12px', borderRadius: 0 }}
                            onClick={() => onNotInterested(extractEmail(email.from_email))}
                            title="Not Interested / Hide Sender"
                            aria-label="Mark as not interested"
                        >
                            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
                            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
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

                    <div className="gmail-toolbar-nav">
                        <span className="gmail-toolbar-nav-count">
                            1 of {totalCount || 1}
                        </span>
                        <div className="flex-center">
                            <button className="gmail-toolbar-btn" disabled style={{ opacity: 0.3 }} aria-label="Previous email">
                                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                            </button>
                            <button className="gmail-toolbar-btn" disabled style={{ opacity: 0.3 }} aria-label="Next email">
                                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                            </button>
                        </div>
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
                            const isIntermediate = idx > 0 && idx < threadMessages.length - 1;

                            // Message Folding Badge
                            const foldThreshold = 4;
                            if (threadMessages.length > foldThreshold && !showAllIntermediate && isIntermediate) {
                                if (idx === 1) return (
                                    <div key="fold-badge" className="gmail-fold-badge-container" onClick={() => setShowAllIntermediate(true)}>
                                        <div className="gmail-fold-line" />
                                        <div className="gmail-fold-chip">
                                            <span className="gmail-fold-count">{threadMessages.length - 2} messages</span>
                                        </div>
                                    </div>
                                );
                                return null;
                            }

                            const isCollapsed = collapsedThreads.has(msg.id) && !isLast;
                            const isSent = msg.direction === 'SENT';

                            const senderNameRaw = extractSenderName(msg.from_email || '');
                            const senderName = senderNameRaw || 'Unknown';
                            const expandedEmail = extractEmail(msg.from_email || '');
                            const toRecipientsText = isSent ? (msg.to_email ? extractSenderName(msg.to_email) || expandedEmail : 'recipient') : 'me';

                            const isHtml = isHtmlBody(msg.body || '');

                            return (
                                <div key={msg.id} className={`gmail-message ${isCollapsed ? 'collapsed' : 'expanded'} ${isLast ? 'last' : ''}`}>
                                    {/* ─── Message Header ─── */}
                                    <div
                                        className="gmail-msg-header"
                                        onClick={!isLast ? () => toggleCollapse(msg.id) : undefined}
                                        style={!isLast ? { cursor: 'pointer', alignItems: (isCollapsed || isLast) ? 'flex-start' : 'center' } : { alignItems: 'flex-start' }}
                                    >
                                        <div
                                            className="gmail-avatar"
                                            style={{
                                                background: avatarColor(expandedEmail || senderName),
                                                marginTop: (isCollapsed || isLast) ? '2px' : '0'
                                            }}
                                        >
                                            {(senderName.charAt(0) || '?').toUpperCase()}
                                        </div>

                                        <div className="gmail-msg-info">
                                            <div className="gmail-msg-top-row" style={isCollapsed ? { flexDirection: 'column', alignItems: 'flex-start', gap: '0' } : { flexDirection: 'row', alignItems: 'baseline', gap: '4px' }}>
                                                <span className="gmail-sender-name">
                                                    {senderName}
                                                    {!isCollapsed && expandedEmail && expandedEmail !== senderName && (
                                                        <span className="gmail-meta-email" style={{ fontWeight: 'normal', color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '4px' }}>
                                                            &lt;{expandedEmail}&gt;
                                                        </span>
                                                    )}
                                                </span>
                                                {isCollapsed && (
                                                    <span className="gmail-snippet" style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: '1px' }}>
                                                        {cleanPreview(msg.snippet || msg.body || '')}
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
                                                            to {toRecipientsText}
                                                        </span>
                                                        <svg
                                                            aria-hidden="true"
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
                                            {/* WhatsApp-style ticks: sent=double grey, opened=double blue */}
                                            {isSent && (
                                                <span className="inline-flex-center-gap-sm" style={{ marginRight: '8px' }}>
                                                    {msg.opened_at ? (
                                                        <CheckCheck size={14} color="var(--accent)" strokeWidth={3} />
                                                    ) : (
                                                        <CheckCheck size={14} color="var(--text-tertiary)" strokeWidth={2.5} />
                                                    )}
                                                </span>
                                            )}
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
                                                <button className="gmail-action-btn" title="Reply" aria-label="Reply to email" onClick={(e) => { e.stopPropagation(); onReply(); }}>
                                                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17L4 12l5-5M4 12h16" /></svg>
                                                </button>
                                                <div className="position-relative">
                                                    <button
                                                        className="gmail-action-btn"
                                                        title="More options"
                                                        aria-label="More options"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenMoreId(openMoreId === msg.id ? null : msg.id);
                                                            setOpenDetailsId(null);
                                                        }}
                                                    >
                                                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
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
                                    {!isCollapsed && (() => {
                                        // Priority 1: msg.body. Priority 2: msg.snippet.
                                        const originalBody = msg.body || msg.snippet || '';
                                        const isHtmlLocal = isHtmlBody(msg.body || '');
                                        let cleanBody = stripOldEmailContent(originalBody, isHtmlLocal);
                                        
                                        // Final absolute fallback: if cleanBody has no visible text, fallback to snippet
                                        const hasVisibleText = cleanBody.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length > 0;
                                        if (!hasVisibleText && msg.snippet) {
                                            cleanBody = msg.snippet;
                                        }

                                        return (
                                            <div className="gmail-msg-body">
                                                {(isHtmlLocal && msg.body && cleanBody !== msg.snippet) ? (
                                                    <EmailBodyFrame
                                                        html={cleanBody
                                                            .replace(/<img[^>]*api\/track[^>]*>/gi, '')
                                                            .replace(/<img /gi, '<img referrerpolicy="no-referrer" ')
                                                            .replace(/data-src=/gi, 'src=')}
                                                    />
                                                ) : (
                                                    <PlainTextBody text={cleanBody} />
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
                                                                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                                                                        <span>{a.filename || 'Attachment'}</span>
                                                                        <span className="gmail-att-size">{a.size ? `${(a.size / 1024).toFixed(0)} KB` : ''}</span>
                                                                    </div>
                                                                ));
                                                            } catch { return null; }
                                                        })()}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}
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
                            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17L4 12l5-5M4 12h16" /></svg>
                            Reply
                        </button>
                        <button className="gmail-reply-btn" onClick={onForward} id="forward-btn">
                            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 17l5-5-5-5M20 12H4" /></svg>
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
    const isHydrated = useHydrated();
    if (!isHydrated || totalPages <= 1) return null;

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
            <div className="pagination-controls">
                <button
                    className="page-btn"
                    onClick={() => onGoToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                >
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </button>
                {getPageNumbers().map((p, i) =>
                    p === '...' ? (
                        <span key={`ellipsis-${i}`} className="pagination-ellipsis">…</span>
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
                    aria-label="Next page"
                >
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth="2">
                            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div className="toast-content">
                        <div className="toast-label">New email</div>
                        <div className="toast-title">{toast.subject}</div>
                        <div className="toast-sub">from {toast.from}</div>
                    </div>
                    <button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
                        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            ))}
        </div>
    );
}
