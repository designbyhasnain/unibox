'use client';

import React, { useState, useRef, useEffect } from 'react';
import { sendEmailAction } from '../../src/actions/emailActions';
import { getAccountsAction } from '../../src/actions/accountActions';
import { Type, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, ChevronDown, Smile, Paperclip, Link, Image, Globe, Lock, Trash2, MoreVertical, Highlighter, Strikethrough, Quote, Eraser, Outdent, Indent, Search, X, Shield } from 'lucide-react';
import { EMOJI_CATEGORIES } from '../constants/emojis';

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
    const [accounts, setAccounts] = useState<any[]>([]);
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
    const [attachments, setAttachments] = useState<File[]>([]);
    const [fontFamily, setFontFamily] = useState('Sans Serif');
    const [fontSize, setFontSize] = useState('Normal');

    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const savedSelection = useRef<Range | null>(null);
    const [emojiSearch, setEmojiSearch] = useState('');
    const [activeEmojiCategory, setActiveEmojiCategory] = useState('Faces');

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
        const fetchAccounts = async () => {
            try {
                const data = await getAccountsAction('1ca1464d-1009-426e-96d5-8c5e8c84faac');
                setAccounts(data);
                if (data.length > 0) setFromAccount(data[0].id);
            } catch (err) { console.error('Failed to fetch accounts:', err); }
        };
        fetchAccounts();
    }, []);

    useEffect(() => {
        if (!isMinimized && editorRef.current) {
            editorRef.current.focus();
        }
    }, [isMinimized]);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== body) {
            editorRef.current.innerHTML = body;
        }
    }, [body]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
        };
        if (showEmojiPicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showEmojiPicker]);

    const handleSend = async () => {
        if (!to.trim() || !fromAccount || isSending) return;
        setIsSending(true);
        setSendResult(null);
        try {
            const payload = { to, subject, body, accountId: fromAccount, ...(threadId ? { threadId } : {}) };
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
        document.execCommand(command, false, value);
        if (editorRef.current) {
            setBody(editorRef.current.innerHTML);
        }
        saveSelection();
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        setBody(e.currentTarget.innerHTML);
    };

    const handleAttachmentClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    const handleRemoveAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
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
            editorRef.current.innerHTML += signature;
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
        <div className={modalClass} onKeyDown={handleKeyDown}>
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
                            <input
                                className="compose-input"
                                type="email"
                                placeholder="To"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                autoFocus
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

                            {attachments.length > 0 && (
                                <div className="compose-attachments-preview">
                                    {attachments.map((file, idx) => (
                                        <div key={idx} className="attachment-chip">
                                            <span>{file.name}</span>
                                            <button onClick={() => handleRemoveAttachment(idx)}>×</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {showFormatting && (
                                <div className="formatting-toolbar" style={{ borderBottom: '1px solid #3c4043', position: 'relative', background: '#303134' }}>
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
                                            <Highlighter size={18} />
                                        </button>
                                    </div>

                                    <div className="format-separator" />

                                    <div className="format-group">
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('justifyLeft'); }} title="Align left">
                                            <AlignLeft size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('justifyCenter'); }} title="Align center">
                                            <AlignCenter size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('justifyRight'); }} title="Align right">
                                            <AlignRight size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('insertUnorderedList'); }} title="Bullet list">
                                            <List size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('insertOrderedList'); }} title="Numbered list">
                                            <ListOrdered size={18} />
                                        </button>
                                    </div>

                                    <div className="format-separator" />

                                    <div className="format-group">
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('indent'); }} title="Indent more">
                                            <Indent size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('outdent'); }} title="Indent less">
                                            <Outdent size={18} />
                                        </button>
                                    </div>

                                    <div className="format-separator" />

                                    <div className="format-group">
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('strikeThrough'); }} title="Strikethrough">
                                            <Strikethrough size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('formatBlock', 'blockquote'); }} title="Quote">
                                            <Quote size={18} />
                                        </button>
                                        <button className="format-btn" onMouseDown={(e) => { e.preventDefault(); execCommand('removeFormat'); }} title="Remove formatting">
                                            <Eraser size={18} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="compose-footer" style={{ borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #3c4043' }}>
                        <div className="compose-footer-left" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div className="compose-send-group">
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
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: 'none' }}
                                onChange={handleFileChange}
                                multiple
                            />

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
                                        backgroundColor: '#202124',
                                        border: '1px solid #3c4043',
                                        borderRadius: '8px',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
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
                                                    background: '#303134',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    color: 'white',
                                                    fontSize: '13px'
                                                }}
                                            />
                                        </div>
                                        <div className="emoji-picker-content" style={{ maxHeight: '250px', overflowY: 'auto', padding: '8px' }}>
                                            {filteredEmojiGroups.map((group) => (
                                                <div key={group.label} className="emoji-category">
                                                    <div className="emoji-category-title" style={{ fontSize: '11px', color: '#9aa0a6', padding: '4px 8px', textTransform: 'uppercase' }}>
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
                                                <div className="no-emojis" style={{ textAlign: 'center', color: '#9aa0a6', padding: '16px' }}>No emojis found</div>
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
                            <button className="compose-icon-btn compose-more-options" title="More options">
                                <MoreVertical size={20} />
                            </button>
                            <button className="compose-icon-btn delete-btn" onClick={onClose} title="Discard draft">
                                <Trash2 size={20} />
                            </button>
                        </div>
                    </div >
                </>
            )}
        </div >
    );
}
