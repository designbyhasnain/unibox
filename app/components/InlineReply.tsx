'use client';

import React, { useState, useRef, useEffect } from 'react';
import { sendEmailAction } from '../../src/actions/emailActions';
import { useGlobalFilter } from '../context/FilterContext';
import { Type, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, ChevronDown, Smile, Link, Globe, Lock, Trash2, MoreVertical, Highlighter, Strikethrough, Quote, Eraser, Outdent, Indent, Search, X, Shield, Send, User } from 'lucide-react';
import DOMPurify from 'dompurify';
import { EMOJI_CATEGORIES } from '../constants/emojis';
import { DEFAULT_USER_ID } from '../constants/config';

interface InlineReplyProps {
    threadId: string;
    to: string;
    subject: string;
    accountId: string;
    onSuccess: () => void;
    onCancel: () => void;
    // Optional optimistic hooks — when provided, the reply is appended to the
    // thread immediately and rolled back only if the server rejects it.
    onOptimisticAppend?: (message: any) => void;
    onOptimisticRollback?: (messageId: string) => void;
    // Jarvis-suggested draft. Changing the `initialBodyKey` re-seeds the editor
    // so the same text can be copied twice if the user clears it in between.
    initialBody?: string;
    initialBodyKey?: number;
}

export default function InlineReply({ threadId, to, subject, accountId, onSuccess, onCancel, onOptimisticAppend, onOptimisticRollback, initialBody, initialBodyKey }: InlineReplyProps) {
    const { accounts: ctxAccounts } = useGlobalFilter();
    const [body, setBody] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<any[]>(ctxAccounts);
    const [selectedAccountId, setSelectedAccountId] = useState(accountId);
    const editorRef = useRef<HTMLDivElement>(null);
    const [showFormatting, setShowFormatting] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [emojiSearch, setEmojiSearch] = useState('');
    const [activeEmojiCategory, setActiveEmojiCategory] = useState('Faces');
    const [fontSize, setFontSize] = useState('Normal');
    const [fontFamily, setFontFamily] = useState('Arial');
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const moreOptionsRef = useRef<HTMLDivElement>(null);
    const selectionRef = useRef<Range | null>(null);

    useEffect(() => {
        if (ctxAccounts.length > 0) setAccounts(ctxAccounts);
    }, [ctxAccounts]);

    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.focus();
        }
    }, []);

    // Seed editor with a Jarvis suggestion when requested.
    useEffect(() => {
        if (!editorRef.current) return;
        if (initialBodyKey === undefined || !initialBody) return;
        const safe = DOMPurify.sanitize(initialBody.replace(/\n/g, '<br/>'));
        editorRef.current.innerHTML = safe;
        setBody(editorRef.current.innerHTML);
        // Move cursor to end
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        const sel = window.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
        editorRef.current.focus();
    }, [initialBody, initialBodyKey]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
            if (moreOptionsRef.current && !moreOptionsRef.current.contains(event.target as Node)) {
                setShowMoreOptions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const saveSelection = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            selectionRef.current = sel.getRangeAt(0);
        }
    };

    const restoreSelection = () => {
        if (selectionRef.current) {
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(selectionRef.current);
            }
        }
    };

    const execCommand = (command: string, value: string = '') => {
        if (editorRef.current) {
            editorRef.current.focus();
            restoreSelection();

            if (command === 'fontSize' || command === 'fontName') {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const span = document.createElement('span');

                    if (command === 'fontSize') {
                        const sizeMap: Record<string, string> = {
                            'Small': '13px',
                            'Normal': '16px',
                            'Large': '20px',
                            'Huge': '24px'
                        };
                        span.style.fontSize = sizeMap[value] || value;
                    } else {
                        span.style.fontFamily = value;
                    }

                    span.appendChild(range.extractContents());
                    range.insertNode(span);
                    setBody(editorRef.current.innerHTML);
                }
            } else if (command === 'insertText') {
                // Use Range API instead of deprecated execCommand('insertText')
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    const textNode = document.createTextNode(value);
                    range.insertNode(textNode);
                    range.setStartAfter(textNode);
                    range.setEndAfter(textNode);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            } else {
                document.execCommand(command, false, value);
            }

            const html = editorRef.current.innerHTML;
            setBody(html);
            saveSelection();
        }
    };

    const handleInsertLink = () => {
        const url = prompt('Enter URL:');
        if (url) {
            execCommand('createLink', url);
        }
    };

    const handleInsertSignature = () => {
        const signature = '<br><br>--<br>Best regards,<br>User';
        if (editorRef.current) {
            editorRef.current.innerHTML += DOMPurify.sanitize(signature);
            setBody(editorRef.current.innerHTML);
        }
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        setBody(e.currentTarget.innerHTML);
    };

    const sendingRef = React.useRef(false);
    const handleSend = async () => {
        if (!body.trim() || isSending || sendingRef.current) return;
        sendingRef.current = true;
        setIsSending(true);
        setError(null);
        const replySubject = subject?.startsWith('Re:') ? subject : `Re: ${subject}`;

        // Optimistic append: show the reply in the thread immediately.
        const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const senderAccount = accounts.find(a => a.id === selectedAccountId);
        const optimisticMsg = {
            id: optimisticId,
            thread_id: threadId,
            from_email: senderAccount?.email || '',
            to_email: to,
            subject: replySubject,
            body,
            snippet: body.replace(/<[^>]+>/g, ' ').slice(0, 200),
            direction: 'SENT',
            sent_at: new Date().toISOString(),
            is_unread: false,
            is_tracked: true,
            opened_at: null,
            delivered_at: null,
            pipeline_stage: null,
            gmail_account_id: selectedAccountId,
            account_email: senderAccount?.email,
            manager_name: 'You',
            gmail_accounts: { email: senderAccount?.email, user: { name: 'You' } },
            has_reply: false,
            _optimistic: true,
        };

        if (onOptimisticAppend) {
            onOptimisticAppend(optimisticMsg);
            // Close the composer instantly — the thread shows the new message.
            onSuccess();
        }

        try {
            const result = await sendEmailAction({ to, subject: replySubject, body, accountId: selectedAccountId, threadId }) as { success: boolean, error?: string, messageId?: string };
            if (result.success) {
                // Only close here when we didn't already close optimistically
                if (!onOptimisticAppend) onSuccess();
            } else {
                // Roll back the optimistic append
                if (onOptimisticAppend && onOptimisticRollback) {
                    onOptimisticRollback(optimisticId);
                    alert(result.error || 'Failed to send reply. Please try again.');
                } else {
                    setError(result.error || 'Failed to send reply.');
                    setIsSending(false);
                    sendingRef.current = false;
                }
            }
        } catch (err: any) {
            if (onOptimisticAppend && onOptimisticRollback) {
                onOptimisticRollback(optimisticId);
                alert(err?.message || 'An unexpected error occurred.');
            } else {
                setError(err?.message || 'An unexpected error occurred.');
                setIsSending(false);
                sendingRef.current = false;
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
        if (e.key === 'Escape') onCancel();
    };

    const handleEmojiClick = (emoji: string) => {
        execCommand('insertText', emoji);
        setShowEmojiPicker(false); // Close picker after selection
    };

    const fontFamilies = ['Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Comic Sans MS', 'Impact', 'Tahoma', 'Trebuchet MS'];
    const fontSizes = ['Small', 'Normal', 'Large', 'Huge'];

    const filteredEmojiGroups = emojiSearch.trim() === ''
        ? EMOJI_CATEGORIES
        : [{
            label: 'Search Results',
            emojis: EMOJI_CATEGORIES.flatMap(g => g.emojis).filter(e =>
                e.keywords.toLowerCase().includes(emojiSearch.toLowerCase())
            )
        }];

    return (
        <div className="inline-reply-container" style={{
            margin: '8px 16px',
            border: '1px solid var(--hairline)',
            borderRadius: '12px',
            background: 'var(--canvas)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            boxShadow: '0 1px 3px 0 rgba(60,64,67,0.3), 0 4px 8px 3px rgba(60,64,67,0.15)',
        }}>
            {/* Header */}
            <div className="inline-reply-header" style={{
                padding: '8px 16px',
                borderBottom: '1px solid var(--hairline)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'var(--surface)',
                borderTopLeftRadius: '11px',
                borderTopRightRadius: '11px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                    <div className="avatar-sm" style={{ background: 'var(--accent)', width: '24px', height: '24px', fontSize: '11px' }}>
                        <User size={14} />
                    </div>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <select
                            value={selectedAccountId}
                            onChange={(e) => setSelectedAccountId(e.target.value)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--ink)',
                                fontSize: '13px',
                                fontWeight: 500,
                                outline: 'none',
                                cursor: 'pointer',
                                paddingRight: '20px',
                                appearance: 'none'
                            }}
                        >
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {acc.email}
                                </option>
                            ))}
                            {!accounts.find(a => a.id === selectedAccountId) && (
                                <option value={selectedAccountId}>Current Account</option>
                            )}
                        </select>
                        <ChevronDown size={12} style={{ position: 'absolute', right: 0, pointerEvents: 'none', color: 'var(--ink-muted)' }} />
                    </div>
                    <span style={{ fontSize: '13px', color: 'var(--ink-muted)', marginLeft: '4px' }}>
                        Replying to <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{to}</span>
                    </span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                    Ctrl+Enter to send
                </span>
            </div>

            <div className="reply-content-area" style={{ position: 'relative' }}>
                {showFormatting && (
                    <div className="formatting-toolbar" style={{ borderBottom: '1px solid #3c4043', position: 'relative', bottom: 'auto' }}>
                        <div className="format-group">
                            <select
                                className="format-select font-family-select"
                                value={fontFamily}
                                onFocus={saveSelection}
                                onChange={(e) => {
                                    setFontFamily(e.target.value);
                                    execCommand('fontName', e.target.value);
                                }}
                            >
                                {fontFamilies.map(f => (
                                    <option key={f} value={f}>{f}</option>
                                ))}
                            </select>

                            <select
                                className="format-select font-size-select"
                                value={fontSize}
                                onFocus={saveSelection}
                                onChange={(e) => {
                                    setFontSize(e.target.value);
                                    execCommand('fontSize', e.target.value);
                                }}
                            >
                                {fontSizes.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        <div className="format-separator" />

                        <div className="format-group">
                            <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('bold'); }} title="Bold">
                                <Bold size={18} />
                            </button>
                            <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('italic'); }} title="Italic">
                                <Italic size={18} />
                            </button>
                            <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('underline'); }} title="Underline">
                                <Underline size={18} />
                            </button>
                            <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('foreColor', '#f28b82'); }} title="Text color">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11 3L5.5 17h2.25l1.12-3h6.25l1.12 3h2.25L13 3h-2zm-1.38 9L12 5.67 14.38 12H9.62zM3 20v2h18v-2H3z" /></svg>
                            </button>
                        </div>

                        <div className="format-separator" />

                        <div className="format-group">
                            <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('justifyLeft'); }} title="Align Left">
                                <AlignLeft size={18} />
                            </button>
                            <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('justifyCenter'); }} title="Align Center">
                                <AlignCenter size={18} />
                            </button>
                            <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('justifyRight'); }} title="Align Right">
                                <AlignRight size={18} />
                            </button>
                        </div>

                        <div className="format-separator" />

                        <div className="format-group">
                            <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('insertUnorderedList'); }} title="Bullet List">
                                <List size={18} />
                            </button>
                            <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('insertOrderedList'); }} title="Numbered List">
                                <ListOrdered size={18} />
                            </button>
                        </div>
                    </div>
                )}

                <div
                    ref={editorRef}
                    contentEditable
                    onInput={handleInput}
                    onMouseUp={saveSelection}
                    onKeyUp={saveSelection}
                    className="compose-editor"
                    data-placeholder="Write your email reply..."
                    style={{
                        minHeight: '150px',
                        padding: '16px',
                        outline: 'none',
                        color: 'var(--ink)',
                        fontSize: '14px',
                        fontFamily: 'var(--font-ui)',
                        background: 'var(--canvas)',
                    }}
                />

                {/* Attachment preview removed - feature coming soon (FE-020) */}
            </div>

            {/* Error */}
            {error && (
                <div className="inline-reply-error" style={{
                    padding: '0.625rem 1rem',
                    background: 'var(--danger-light)',
                    borderTop: '1px solid rgba(239, 68, 68, 0.15)',
                    fontSize: '0.8125rem',
                    color: 'var(--danger)',
                }}>
                    {error}
                </div>
            )}

            {/* Footer */}
            <div className="inline-reply-footer" style={{
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderTop: '1px solid var(--hairline)',
                background: 'var(--surface)',
                borderBottomLeftRadius: '11px',
                borderBottomRightRadius: '11px',
            }}>
                <div className="compose-footer-left" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div className="compose-send-group">
                        <button className="compose-send-btn" onClick={handleSend}>
                            Send
                        </button>
                        <button className="compose-send-caret">
                            <ChevronDown size={14} />
                        </button>
                    </div>

                    <button
                        className={`compose-icon-btn ${showFormatting ? 'active' : ''}`}
                        onClick={() => setShowFormatting(!showFormatting)}
                        title="Formatting options"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 19h19v2h-19v-2zm1.14-4.22h3.58l.84 2.22h1.86L6 5h-1.33L1.2 17h1.6l.84-2.22zM5.38 8.01L7.26 13h-3.8l1.92-4.99z" /></svg>
                    </button>
                    <button className="compose-icon-btn" title="Insert link" onClick={handleInsertLink}>
                        <Link size={20} />
                    </button>
                    <div style={{ position: 'relative' }}>
                        <button
                            className={`compose-icon-btn ${showEmojiPicker ? 'active' : ''}`}
                            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                            title="Insert emoji"
                        >
                            <Smile size={20} />
                        </button>

                        {/* Emoji Picker - Moved here for better positioning */}
                        {showEmojiPicker && (
                            <div className="emoji-picker-container emoji-picker-advanced" ref={emojiPickerRef} style={{
                                position: 'absolute',
                                bottom: 'calc(100% + 10px)',
                                left: '0',
                                zIndex: 1000,
                                backgroundColor: 'var(--canvas)',
                                border: '1px solid var(--hairline)',
                                borderRadius: '8px',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                                width: '320px'
                            }}>
                                <div className="emoji-picker-header" style={{ padding: '8px' }}>
                                    <input
                                        type="text"
                                        placeholder="Search emojis..."
                                        value={emojiSearch}
                                        onChange={(e) => setEmojiSearch(e.target.value)}
                                        autoFocus
                                        style={{
                                            width: '100%',
                                            padding: '8px',
                                            background: 'var(--surface)',
                                            border: 'none',
                                            borderRadius: '4px',
                                            color: 'var(--ink)',
                                            fontSize: '13px'
                                        }}
                                    />
                                </div>
                                <div className="emoji-picker-content" style={{ maxHeight: '300px', overflowY: 'auto', padding: '8px' }}>
                                    {filteredEmojiGroups.map((group) => (
                                        <div key={group.label} className="emoji-category">
                                            <div className="emoji-category-title" style={{ fontSize: '11px', color: 'var(--ink-muted)', padding: '4px 8px', textTransform: 'uppercase' }}>
                                                {group.label}
                                            </div>
                                            <div className="emoji-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '4px' }}>
                                                {group.emojis.map((emojiObj, idx) => (
                                                    <button
                                                        key={`${emojiObj.char}-${idx}`}
                                                        className="emoji-btn"
                                                        onClick={() => handleEmojiClick(emojiObj.char)}
                                                        type="button"
                                                        style={{
                                                            fontSize: '20px',
                                                            padding: '4px',
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            borderRadius: '4px'
                                                        }}
                                                    >
                                                        {emojiObj.char}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    {filteredEmojiGroups?.[0]?.emojis?.length === 0 && (
                                        <div className="no-emojis" style={{ textAlign: 'center', color: '#9aa0a6', padding: '16px' }}>No emojis found</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    <button className="compose-icon-btn" title="Insert files using Drive">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.34 10.5l-4-7h-6.7l4 7h6.7zM14 11.5l-4 7h6.7l4-7H14zM12 11.1L8.3 4.5H1.6l4 7H12zM12.7 12.5H6l-4 7h6.7l4-7z" /></svg>
                    </button>
                    <button className="compose-icon-btn" title="Toggle confidential mode">
                        <Shield size={20} />
                    </button>
                    <button className="compose-icon-btn" title="Insert signature" onClick={handleInsertSignature}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14 14.5c.34 0 .68.04 1 .1A2.478 2.478 0 0 0 17 12c0-1.38-1.12-2.5-2.5-2.5S12 10.62 12 12c0 .41.1.8.27 1.14-.09-.04-.18-.08-.27-.14zM17 17H7v-2h10v2zm0-4H7v-2h10v2zM7 7h10v2H7V7z" /></svg>
                    </button>
                </div>

                <div className="compose-footer-right" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ position: 'relative' }}>
                        <button
                            className={`compose-icon-btn ${showMoreOptions ? 'active' : ''}`}
                            onClick={() => setShowMoreOptions(!showMoreOptions)}
                            title="More options"
                        >
                            <MoreVertical size={20} />
                        </button>

                        {showMoreOptions && (
                            <div className="gmail-msg-popover more-options" ref={moreOptionsRef} style={{ bottom: 'calc(100% + 10px)', top: 'auto', right: 0, left: 'auto', width: '180px', padding: '6px 0' }}>
                                <div className="popover-action-item" onClick={() => { window.print(); setShowMoreOptions(false); }}>
                                    Print
                                </div>
                            </div>
                        )}
                    </div>
                    <button className="compose-icon-btn" onClick={onCancel} title="Discard draft">
                        <Trash2 size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
