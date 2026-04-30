'use client';

import React, { useState, useRef, useEffect } from 'react';
import { sendEmailAction, searchContactsForComposeAction } from '../../src/actions/emailActions';
import { useUndoToast } from '../context/UndoToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { useGlobalFilter } from '../context/FilterContext';
import { ChevronDown, LayoutTemplate, Sparkles, Send, X, Maximize2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import TemplatePickerModal from './TemplatePickerModal';

interface ComposeModalProps {
    onClose: () => void;
    defaultTo?: string;
    defaultSubject?: string;
    defaultBody?: string;
    threadId?: string;
}

type ContactSuggestion = { id: string; name: string | null; email: string; company: string | null };

const AVATAR_COLORS = [
    'oklch(0.65 0.19 25)',
    'oklch(0.62 0.17 145)',
    'oklch(0.58 0.19 265)',
    'oklch(0.65 0.17 330)',
    'oklch(0.68 0.14 55)',
    'oklch(0.55 0.18 295)',
];

function getInitials(str: string) {
    if (str.includes('@')) {
        const local = str.split('@')[0] || '';
        const parts = local.split(/[._-]/);
        if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
        return local.slice(0, 2).toUpperCase();
    }
    const words = str.trim().split(/\s+/);
    if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
    return str.slice(0, 2).toUpperCase();
}

function avatarColor(str: string) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h + str.charCodeAt(i) * 31) % AVATAR_COLORS.length;
    return AVATAR_COLORS[h]!;
}

export default function ComposeModal({ onClose, defaultTo = '', defaultSubject = '', defaultBody = '', threadId = '' }: ComposeModalProps) {
    const [recipients, setRecipients] = useState<string[]>(defaultTo ? defaultTo.split(',').map(e => e.trim()).filter(Boolean) : []);
    const [toInput, setToInput] = useState('');
    const [subject, setSubject] = useState(defaultSubject);
    const [body, setBody] = useState(defaultBody);
    const [fromAccount, setFromAccount] = useState('');
    const { accounts: ctxAccounts } = useGlobalFilter();
    const [accounts, setAccounts] = useState<any[]>(ctxAccounts);
    const [isSending, setIsSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

    const [showCc, setShowCc] = useState(false);
    const [showBcc, setShowBcc] = useState(false);
    const [cc, setCc] = useState('');
    const [bcc, setBcc] = useState('');
    const [showFromDropdown, setShowFromDropdown] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);

    const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(-1);
    const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
    const toFieldRef = useRef<HTMLDivElement>(null);
    const toInputRef = useRef<HTMLInputElement>(null);

    const editorRef = useRef<HTMLDivElement>(null);
    const fromDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ctxAccounts.length > 0) {
            setAccounts(ctxAccounts);
            if (!fromAccount) setFromAccount(ctxAccounts[0].id);
        }
    }, [ctxAccounts]);

    useEffect(() => {
        if (editorRef.current) {
            const sanitized = DOMPurify.sanitize(body);
            if (editorRef.current.innerHTML !== sanitized) {
                editorRef.current.innerHTML = sanitized;
            }
        }
    }, [body]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (fromDropdownRef.current && !fromDropdownRef.current.contains(e.target as Node)) {
                setShowFromDropdown(false);
            }
            if (toFieldRef.current && !toFieldRef.current.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (!toInput.trim()) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            const results = await searchContactsForComposeAction(toInput.trim());
            const filtered = results.filter(c => !recipients.includes(c.email));
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
            setHighlightIdx(-1);
        }, 200);
        return () => clearTimeout(searchTimeout.current);
    }, [toInput, recipients]);

    const addRecipient = (email: string) => {
        const e = email.trim().toLowerCase();
        if (e && !recipients.includes(e)) {
            setRecipients(prev => [...prev, e]);
        }
        setToInput('');
        setSuggestions([]);
        setShowSuggestions(false);
        toInputRef.current?.focus();
    };

    const removeRecipient = (email: string) => {
        setRecipients(prev => prev.filter(r => r !== email));
    };

    const handleToKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
            e.preventDefault();
            if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
                addRecipient(suggestions[highlightIdx]!.email);
            } else if (toInput.trim()) {
                addRecipient(toInput);
            }
        } else if (e.key === 'Backspace' && !toInput && recipients.length > 0) {
            removeRecipient(recipients[recipients.length - 1]!);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIdx(prev => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIdx(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const { showError } = useUndoToast();
    const confirm = useConfirm();
    const sendingRef = useRef(false);
    const handleSend = async () => {
        const toStr = recipients.join(', ');
        if (!toStr || !fromAccount || isSending || sendingRef.current) return;
        sendingRef.current = true;
        setIsSending(true);
        setSendResult(null);
        try {
            const payload = { to: toStr, subject, body, accountId: fromAccount, isTracked: true, ...(threadId ? { threadId } : {}) };
            const result = await sendEmailAction(payload) as { success: boolean; error?: string; messageId?: string };
            if (result.success) {
                setSendResult({ success: true, message: 'Message sent.' });
                setTimeout(() => onClose(), 2000);
            } else {
                const msg = result.error || 'Error sending.';
                setSendResult({ success: false, message: msg });
                showError(`Couldn't send email: ${msg}`, { onRetry: handleSend });
                setIsSending(false);
                sendingRef.current = false;
            }
        } catch (err: any) {
            const msg = err.message || 'Error occurred.';
            setSendResult({ success: false, message: msg });
            showError(`Couldn't send email: ${msg}`, { onRetry: handleSend });
            setIsSending(false);
            sendingRef.current = false;
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSend(); }
        if (e.key === 'Escape') onClose();
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        setBody(e.currentTarget.innerHTML);
    };

    const selectedAccount = accounts.find(a => a.id === fromAccount);
    const selectedEmail = selectedAccount?.email || 'Select account';

    return (
        <>
            <div className="compose-scrim" onClick={onClose} />
            <div className="compose" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown} role="dialog" aria-modal="true">
                <div className="compose-head">
                    <div className="title">New email</div>
                    <div className="spacer" />
                    <button className="icon-btn" title="Pop out"><Maximize2 size={13} /></button>
                    <button className="icon-btn" onClick={onClose} title="Close"><X size={14} /></button>
                </div>

                <div className="compose-body">
                    {/* From */}
                    <div className="compose-field" ref={fromDropdownRef}>
                        <span className="k">From</span>
                        <span className="pill" onClick={() => setShowFromDropdown(!showFromDropdown)} style={{ cursor: 'pointer' }}>
                            <span className="dot" style={{ background: avatarColor(selectedEmail) }}>{getInitials(selectedEmail)}</span>
                            {selectedEmail}
                            <ChevronDown size={12} style={{ color: 'var(--ink-muted)' }} />
                        </span>
                        {showFromDropdown && (
                            <div className="compose-from-dropdown">
                                {accounts.map(acc => (
                                    <div
                                        key={acc.id}
                                        className={`compose-from-option${acc.id === fromAccount ? ' active' : ''}`}
                                        onClick={() => { setFromAccount(acc.id); setShowFromDropdown(false); }}
                                    >
                                        <span className="dot" style={{ background: avatarColor(acc.email), width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 9, fontWeight: 600 }}>
                                            {getInitials(acc.email)}
                                        </span>
                                        {acc.email}{acc.manager_name ? ` (${acc.manager_name})` : ''}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 12 }}>
                            <span className="chip" style={{ color: 'var(--coach)', borderColor: 'transparent', background: 'color-mix(in oklab, var(--coach-soft), transparent 20%)' }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                Tracking on
                            </span>
                        </div>
                    </div>

                    {/* To with autocomplete */}
                    <div className="compose-field" ref={toFieldRef} style={{ position: 'relative' }}>
                        <span className="k">To</span>
                        {recipients.map((email, i) => (
                            <span key={i} className="pill" style={{ cursor: 'default' }}>
                                <span className="dot" style={{ background: avatarColor(email) }}>{getInitials(email)}</span>
                                {email}
                                <button
                                    onClick={() => removeRecipient(email)}
                                    style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', cursor: 'pointer', padding: 0, marginLeft: 2, fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center' }}
                                >
                                    <X size={10} />
                                </button>
                            </span>
                        ))}
                        <input
                            ref={toInputRef}
                            type="text"
                            value={toInput}
                            onChange={e => setToInput(e.target.value)}
                            onKeyDown={handleToKeyDown}
                            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                            placeholder={recipients.length === 0 ? 'Search contacts...' : ''}
                            autoFocus
                        />
                        <div className="actions">
                            {!showCc && <button onClick={() => setShowCc(true)}>Cc</button>}
                            {!showBcc && <button onClick={() => setShowBcc(true)}>Bcc</button>}
                        </div>

                        {showSuggestions && suggestions.length > 0 && (
                            <div className="compose-suggestions">
                                {suggestions.map((s, i) => (
                                    <div
                                        key={s.id}
                                        className={`compose-suggestion${i === highlightIdx ? ' active' : ''}`}
                                        onClick={() => addRecipient(s.email)}
                                        onMouseEnter={() => setHighlightIdx(i)}
                                    >
                                        <span className="dot" style={{ background: avatarColor(s.email), width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                                            {getInitials(s.name || s.email)}
                                        </span>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {s.name || s.email.split('@')[0]}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {s.email}{s.company ? ` · ${s.company}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {showCc && (
                        <div className="compose-field">
                            <span className="k">Cc</span>
                            <input type="email" value={cc} onChange={e => setCc(e.target.value)} />
                        </div>
                    )}
                    {showBcc && (
                        <div className="compose-field">
                            <span className="k">Bcc</span>
                            <input type="email" value={bcc} onChange={e => setBcc(e.target.value)} />
                        </div>
                    )}

                    <div className="compose-subject">
                        <input
                            type="text"
                            placeholder="Subject"
                            value={subject}
                            onChange={e => setSubject(e.target.value)}
                        />
                    </div>

                    <div className="compose-editor">
                        <div
                            ref={editorRef}
                            contentEditable="true"
                            onInput={handleInput}
                            onKeyDown={handleKeyDown}
                            data-placeholder="Write your message..."
                            style={{ minHeight: 200, outline: 'none', fontSize: '13.5px', lineHeight: 1.6, color: 'var(--ink-2)' }}
                        />
                    </div>
                </div>

                {sendResult && (
                    <div style={{
                        padding: '8px 14px', margin: '0 20px 8px', borderRadius: 8, fontSize: 13, fontWeight: 500, textAlign: 'center',
                        background: sendResult.success ? 'color-mix(in oklab, var(--coach-soft), transparent 20%)' : 'color-mix(in oklab, var(--danger-soft), transparent 20%)',
                        color: sendResult.success ? 'var(--coach)' : 'var(--danger)',
                        border: `1px solid ${sendResult.success ? 'var(--coach)' : 'var(--danger)'}`,
                    }}>
                        {sendResult.message}
                    </div>
                )}

                <div className="compose-foot">
                    <button className="icon-btn" title="Templates" onClick={() => setShowTemplatePicker(true)}><LayoutTemplate size={15} /></button>
                    <div className="spacer" />
                    <button className="ask-ai"><Sparkles size={12} />Ask AI</button>
                    <button className="send" onClick={handleSend} disabled={isSending || recipients.length === 0}>
                        <Send size={12} />
                        {isSending ? 'Sending…' : 'Send'}
                    </button>
                </div>
            </div>

            <TemplatePickerModal
                isOpen={showTemplatePicker}
                onClose={() => setShowTemplatePicker(false)}
                onSelect={async (tmpl) => {
                    const hasContent = subject.trim() || body.trim();
                    if (hasContent) {
                        const ok = await confirm({
                            title: 'Replace current content with template?',
                            message: 'Your draft subject and body will be overwritten by this template.',
                            confirmLabel: 'Replace',
                            danger: true,
                        });
                        if (!ok) return;
                    }
                    setSubject(tmpl.subject);
                    setBody(tmpl.body);
                    if (editorRef.current) {
                        editorRef.current.innerHTML = tmpl.body;
                    }
                }}
            />
        </>
    );
}
