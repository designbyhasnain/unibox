'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { sendEmailAction } from '../../src/actions/emailActions';
import { useGlobalFilter } from '../context/FilterContext';
import { Type, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, ChevronDown, Smile, Paperclip, Link, Image, Trash2, MoreVertical, Highlighter, Strikethrough, Quote, Eraser, Outdent, Indent, Shield } from 'lucide-react';
import DOMPurify from 'dompurify';
import { EMOJI_CATEGORIES } from '../constants/emojis';
import { DEFAULT_USER_ID } from '../constants/config';

interface ComposeModalProps {
    onClose: () => void;
    defaultTo?: string;
    defaultSubject?: string;
    threadId?: string;
}

export default function ComposeModal({ onClose, defaultTo = '', defaultSubject = '', threadId = '' }: ComposeModalProps) {
    const [to, setTo] = useState(defaultTo);
    const [subject, setSubject] = useState(defaultSubject);
    const [body, setBody] = useState('');
    const [fromAccount, setFromAccount] = useState('');
    const { accounts: ctxAccounts } = useGlobalFilter();
    const [accounts, setAccounts] = useState<any[]>(ctxAccounts);
    const [isSending, setIsSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);

    const [showCc, setShowCc] = useState(false);
    const [showBcc, setShowBcc] = useState(false);
    const [cc, setCc] = useState('');
    const [bcc, setBcc] = useState('');

    const [showFormatting, setShowFormatting] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [fontFamily, setFontFamily] = useState('Sans Serif');
    const [fontSize, setFontSize] = useState('Normal');
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const [showFromDropdown, setShowFromDropdown] = useState(false);

    const editorRef = useRef<HTMLDivElement>(null);
    const moreOptionsRef = useRef<HTMLDivElement>(null);
    const fromDropdownRef = useRef<HTMLDivElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const savedSelection = useRef<Range | null>(null);
    const [emojiSearch, setEmojiSearch] = useState('');
    const [activeEmojiCategory, setActiveEmojiCategory] = useState('Faces');

    // Ref to track dropdown/picker state for the click-outside handler (avoids listener leak)
    const dropdownStateRef = useRef({ showEmojiPicker, showMoreOptions, showFromDropdown });
    dropdownStateRef.current = { showEmojiPicker, showMoreOptions, showFromDropdown };

    const saveSelection = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            savedSelection.current = sel.getRangeAt(0);
        }
    };

    const restoreSelection = () => {
        if (!savedSelection.current) return;
        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(savedSelection.current);
        }
    };

    useEffect(() => {
        if (ctxAccounts.length > 0) {
            setAccounts(ctxAccounts);
            if (!fromAccount) setFromAccount(ctxAccounts[0].id);
        }
    }, [ctxAccounts]);

    useEffect(() => {
        if (!isMinimized && editorRef.current) {
            editorRef.current.focus();
        }
    }, [isMinimized]);

    useEffect(() => {
        if (editorRef.current) {
            const sanitized = DOMPurify.sanitize(body);
            if (editorRef.current.innerHTML !== sanitized) {
                editorRef.current.innerHTML = sanitized;
            }
        }
    }, [body]);

    // Register click-outside listener once on mount; read state from ref to avoid leak
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const s = dropdownStateRef.current;
            if (!s.showEmojiPicker && !s.showMoreOptions && !s.showFromDropdown) return;

            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
            if (moreOptionsRef.current && !moreOptionsRef.current.contains(event.target as Node)) {
                setShowMoreOptions(false);
            }
            if (fromDropdownRef.current && !fromDropdownRef.current.contains(event.target as Node)) {
                setShowFromDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []); // Empty deps — register once, no leak

    const handleSend = async () => {
        if (!to.trim() || !fromAccount || isSending) return;
        setIsSending(true);
        setSendResult(null);
        try {
            const payload = { to, subject, body, accountId: fromAccount, isTracked: true, ...(threadId ? { threadId } : {}) };
            const result = await sendEmailAction(payload) as { success: boolean, error?: string, messageId?: string };
            if (result.success) {
                setSendResult({ success: true, message: 'Message sent.' });
                setTimeout(() => onClose(), 2000);
            } else {
                setSendResult({ success: false, message: result.error || 'Error sending.' });
                setIsSending(false);
            }
        } catch (err: any) {
            setSendResult({ success: false, message: err.message || 'Error occurred.' });
            setIsSending(false);
        }
    };



    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSend(); }
        if (e.key === 'Escape') onClose();
    };

    const execCommand = (command: string, value: any = null) => {
        restoreSelection();
        if (command === 'insertText' && editorRef.current) {
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
        if (editorRef.current) {
            setBody(editorRef.current.innerHTML);
        }
        saveSelection();
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        setBody(e.currentTarget.innerHTML);
    };

    const handleAttachmentClick = () => {
        // Attachments are not yet wired to the send action (FE-020)
        alert('Attachments are coming soon. This feature is not yet available.');
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
    // Fallback as we don't have descriptions, but usually emojis are searched by keywords.

    const modalClass = `compose-modal${isMinimized ? ' minimized' : ''}${isMaximized ? ' maximized' : ''}`;

    return (
        <div className={modalClass} onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-label="Compose new message">
            {/* Header */}
            <div
                className="compose-header"
                onClick={() => setIsMinimized(!isMinimized)}
            >
                <span className="compose-title">
                    {isMinimized ? (subject ? subject : 'New Message') : 'New Message'}
                </span>
                <div className="compose-controls">
                    <button
                        className="compose-control-btn"
                        onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); setIsMaximized(false); }}
                        title="Minimize"
                    >
                        <svg viewBox="0 0 24 24" width="12" height="12"><path d="M19 13H5v-2h14v2z" fill="currentColor" /></svg>
                    </button>
                    {!isMinimized && (
                        <button
                            className="compose-control-btn"
                            onClick={(e) => { e.stopPropagation(); setIsMaximized(!isMaximized); }}
                            title={isMaximized ? 'Exit full screen' : 'Full screen'}
                        >
                            <svg viewBox="0 0 24 24" width="13" height="13"><path d={isMaximized ? "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" : "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"} fill="currentColor" /></svg>
                        </button>
                    )}
                    <button className="compose-control-btn close-btn" onClick={(e) => { e.stopPropagation(); onClose(); }} title="Save & close">
                        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" fill="currentColor" /></svg>
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    <div className="compose-body-container">
                        <div className="compose-row">
                            <span className="compose-inline-label">From</span>
                            <div ref={fromDropdownRef} style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <div
                                    onClick={() => setShowFromDropdown(!showFromDropdown)}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        padding: '4px 0',
                                        fontSize: '14px',
                                        color: '#202124'
                                    }}
                                >
                                    <span>
                                        {accounts.find(a => a.id === fromAccount)
                                            ? `${accounts.find(a => a.id === fromAccount)!.email}${accounts.find(a => a.id === fromAccount)!.manager_name ? ` (${accounts.find(a => a.id === fromAccount)!.manager_name})` : ''}`
                                            : 'Select account'}
                                    </span>
                                    <ChevronDown size={14} style={{ color: '#5f6368', flexShrink: 0 }} />
                                </div>
                                {showFromDropdown && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 4px)',
                                        left: '-16px',
                                        right: '-24px',
                                        background: '#ffffff',
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '4px',
                                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                                        zIndex: 2000,
                                        maxHeight: '240px',
                                        overflowY: 'auto'
                                    }}>
                                        {accounts.map(acc => (
                                            <div
                                                key={acc.id}
                                                onClick={() => { setFromAccount(acc.id); setShowFromDropdown(false); }}
                                                style={{
                                                    padding: '10px 16px',
                                                    fontSize: '14px',
                                                    color: '#202124',
                                                    cursor: 'pointer',
                                                    background: acc.id === fromAccount ? '#e8f0fe' : '#ffffff',
                                                    fontWeight: acc.id === fromAccount ? 500 : 400
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = acc.id === fromAccount ? '#e8f0fe' : '#f1f3f4')}
                                                onMouseLeave={e => (e.currentTarget.style.background = acc.id === fromAccount ? '#e8f0fe' : '#ffffff')}
                                            >
                                                {acc.email} {acc.manager_name ? `(${acc.manager_name})` : ''}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="compose-row">
                            <input
                                className="compose-input"
                                type="email"
                                placeholder="To"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                autoFocus
                                aria-label="To"
                            />
                            <div className="compose-cc-bcc-actions">
                                {!showCc && <span onClick={() => setShowCc(true)}>Cc</span>}
                                {!showBcc && <span onClick={() => setShowBcc(true)}>Bcc</span>}
                            </div>
                        </div>

                        {showCc && (
                            <div className="compose-row">
                                <span className="compose-inline-label">Cc</span>
                                <input
                                    className="compose-input"
                                    type="email"
                                    value={cc}
                                    onChange={(e) => setCc(e.target.value)}
                                    aria-label="CC"
                                />
                            </div>
                        )}

                        {showBcc && (
                            <div className="compose-row">
                                <span className="compose-inline-label">Bcc</span>
                                <input
                                    className="compose-input"
                                    type="email"
                                    value={bcc}
                                    onChange={(e) => setBcc(e.target.value)}
                                    aria-label="BCC"
                                />
                            </div>
                        )}

                        <div className="compose-row">
                            <input
                                className="compose-input"
                                type="text"
                                placeholder="Subject"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                aria-label="Subject"
                            />
                        </div>

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                            <div
                                ref={editorRef}
                                className="compose-editor"
                                contentEditable="true"
                                onInput={handleInput}
                                onKeyDown={handleKeyDown}
                                onMouseUp={saveSelection}
                                onKeyUp={saveSelection}
                                data-placeholder="Write your message..."
                            />

                            {/* Attachment preview removed - feature coming soon (FE-020) */}
                            {showFormatting && (
                                <div className="formatting-toolbar" style={{ borderBottom: '1px solid #e0e0e0', position: 'relative', background: '#f8f9fa' }}>
                                    <div className="format-group">
                                        <select
                                            className="format-select font-family-select"
                                            value={fontFamily}
                                            onFocus={saveSelection}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setFontFamily(val);
                                                execCommand('fontName', val);
                                            }}
                                        >
                                            {fontFamilies.map(f => <option key={f} value={f}>{f}</option>)}
                                        </select>
                                        <select
                                            className="format-select font-size-select"
                                            value={fontSize}
                                            onFocus={saveSelection}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setFontSize(val);
                                                const sizeMap: any = {
                                                    'Small': '13px',
                                                    'Normal': '16px',
                                                    'Large': '20px',
                                                    'Huge': '24px'
                                                };
                                                if (editorRef.current) {
                                                    editorRef.current.focus();
                                                    restoreSelection();
                                                    const selection = window.getSelection();
                                                    if (selection && selection.rangeCount > 0) {
                                                        const range = selection.getRangeAt(0);
                                                        const span = document.createElement('span');
                                                        span.style.fontSize = sizeMap[val];
                                                        span.appendChild(range.extractContents());
                                                        range.insertNode(span);
                                                        setBody(editorRef.current.innerHTML);
                                                    }
                                                    saveSelection();
                                                }
                                            }}
                                        >
                                            {fontSizes.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>

                                    <div className="format-separator" />

                                    <div className="format-group">
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('bold'); }} title="Bold" aria-label="Bold">
                                            <Bold size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('italic'); }} title="Italic" aria-label="Italic">
                                            <Italic size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('underline'); }} title="Underline" aria-label="Underline">
                                            <Underline size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('foreColor', '#f28b82'); }} title="Text color" aria-label="Text color">
                                            <Highlighter size={18} />
                                        </button>
                                    </div>

                                    <div className="format-separator" />

                                    <div className="format-group">
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('justifyLeft'); }} title="Align left" aria-label="Align left">
                                            <AlignLeft size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('justifyCenter'); }} title="Align center" aria-label="Align center">
                                            <AlignCenter size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('justifyRight'); }} title="Align right" aria-label="Align right">
                                            <AlignRight size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('insertUnorderedList'); }} title="Bullet list" aria-label="Bullet list">
                                            <List size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('insertOrderedList'); }} title="Numbered list" aria-label="Numbered list">
                                            <ListOrdered size={18} />
                                        </button>
                                    </div>

                                    <div className="format-separator" />

                                    <div className="format-group">
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('indent'); }} title="Indent more" aria-label="Indent more">
                                            <Indent size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('outdent'); }} title="Indent less" aria-label="Indent less">
                                            <Outdent size={18} />
                                        </button>
                                    </div>

                                    <div className="format-separator" />

                                    <div className="format-group">
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('strikeThrough'); }} title="Strikethrough" aria-label="Strikethrough">
                                            <Strikethrough size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('formatBlock', 'blockquote'); }} title="Quote" aria-label="Quote">
                                            <Quote size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('removeFormat'); }} title="Remove formatting" aria-label="Remove formatting">
                                            <Eraser size={18} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="compose-footer" style={{ borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', padding: '8px 16px', display: 'flex', flexDirection: 'column', borderTop: '1px solid #e0e0e0', overflow: 'visible', position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                            <div className="compose-footer-left" style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                <div className="compose-send-group" style={{ marginRight: '8px' }}>
                                    <button
                                        className="compose-send-btn"
                                        onClick={handleSend}
                                        disabled={isSending || !to.trim()}
                                    >
                                        {isSending ? 'Sending...' : 'Send'}
                                    </button>
                                    <button className="compose-send-caret" disabled={isSending || !to.trim()}>
                                        <ChevronDown size={14} />
                                    </button>
                                </div>

                                <button
                                    className={`compose-icon-btn formatting-toggle ${showFormatting ? 'active' : ''}`}
                                    title="Formatting options"
                                    onClick={() => setShowFormatting(!showFormatting)}
                                >
                                    <Type size={20} />
                                </button>

                                <button className="compose-icon-btn" title="Attach files" onClick={handleAttachmentClick}>
                                    <Paperclip size={20} />
                                </button>

                                <button className="compose-icon-btn" title="Insert link" onClick={handleInsertLink}>
                                    <Link size={20} />
                                </button>

                                <div style={{ position: 'relative' }}>
                                    <button
                                        className={`compose-icon-btn ${showEmojiPicker ? 'active' : ''}`}
                                        title="Insert emoji"
                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                    >
                                        <Smile size={20} />
                                    </button>

                                    {showEmojiPicker && (
                                        <div className="emoji-picker-container emoji-picker-advanced" ref={emojiPickerRef} style={{
                                            position: 'absolute',
                                            bottom: 'calc(100% + 10px)',
                                            left: '0',
                                            zIndex: 1000,
                                            backgroundColor: '#ffffff',
                                            border: '1px solid #e0e0e0',
                                            borderRadius: '8px',
                                            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
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
                                                        background: '#f1f3f4',
                                                        border: '1px solid #e0e0e0',
                                                        borderRadius: '4px',
                                                        color: '#202124',
                                                        fontSize: '13px',
                                                        outline: 'none'
                                                    }}
                                                />
                                            </div>
                                            <div className="emoji-picker-content" style={{ maxHeight: '250px', overflowY: 'auto', padding: '8px' }}>
                                                {filteredEmojiGroups.map((group) => (
                                                    <div key={group.label} className="emoji-category">
                                                        <div className="emoji-category-title" style={{ fontSize: '11px', color: '#5f6368', padding: '4px 8px', textTransform: 'uppercase', fontWeight: 600 }}>
                                                            {group.label}
                                                        </div>
                                                        <div className="emoji-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '4px' }}>
                                                            {group.emojis.map((emojiObj, idx) => (
                                                                <button
                                                                    key={`${emojiObj.char}-${idx}`}
                                                                    className="emoji-btn"
                                                                    onClick={() => {
                                                                        execCommand('insertText', emojiObj.char);
                                                                        setShowEmojiPicker(false);
                                                                    }}
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
                                                    <div className="no-emojis" style={{ textAlign: 'center', color: '#5f6368', padding: '16px' }}>No emojis found</div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <button className="compose-icon-btn" title="Insert files using Drive">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.34 10.5l-4-7h-6.7l4 7h6.7zM14 11.5l-4 7h6.7l4-7H14zM12 11.1L8.3 4.5H1.6l4 7H12zM12.7 12.5H6l-4 7h6.7l4-7z" /></svg>
                                </button>

                                <button className="compose-icon-btn" title="Insert photo" onClick={handleAttachmentClick}>
                                    <Image size={20} />
                                </button>

                                <button className="compose-icon-btn" title="Toggle confidential mode">
                                    <Shield size={20} />
                                </button>

                                <button className="compose-icon-btn" title="Insert signature" onClick={handleInsertSignature}>
                                    <Highlighter size={20} />
                                </button>
                            </div>

                            <div className="compose-footer-right" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {sendResult && (
                                    <span style={{ fontSize: '12px', color: sendResult.success ? '#81c995' : '#f28b82', paddingRight: '8px' }}>
                                        {sendResult.message}
                                    </span>
                                )}
                                <div style={{ position: 'relative' }}>
                                    <button
                                        className={`compose-icon-btn compose-more-options ${showMoreOptions ? 'active' : ''}`}
                                        title="More options"
                                        onClick={() => setShowMoreOptions(!showMoreOptions)}
                                    >
                                        <MoreVertical size={20} />
                                    </button>
                                    {showMoreOptions && (
                                        <div className="gmail-msg-popover more-options" ref={moreOptionsRef} style={{ bottom: 'calc(100% + 10px)', top: 'auto', right: 0, left: 'auto', width: '180px', padding: '6px 0', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}>
                                            <div className="popover-action-item" onClick={() => { window.print(); setShowMoreOptions(false); }}>
                                                Print
                                            </div>
                                            <div className="popover-action-item" onClick={() => { alert('Check spelling coming soon...'); setShowMoreOptions(false); }}>
                                                Check spelling
                                            </div>
                                            <div className="popover-separator" />
                                            <div className="popover-action-item" onClick={() => { setShowMoreOptions(false); }}>
                                                Plain text mode
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button className="compose-icon-btn delete-btn" onClick={onClose} title="Discard draft">
                                    <Trash2 size={20} />
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <style jsx>{`
                .compose-modal {
                    max-width: min(500px, calc(100vw - 32px));
                }
            `}</style>
        </div>
    );
}
