'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
    uploadPersonaImageAction,
    updateAccountPersonaAction,
    bulkApplyPersonaAction,
    clearPersonaAction,
} from '../../src/actions/accountActions';

export interface PersonaTarget {
    id: string;
    email: string;
    displayName: string | null;
    profileImage: string | null;
}

interface Props {
    /** Pass a single target for per-account edit, or pass `bulkTargets` for multi-apply. */
    target?: PersonaTarget;
    bulkTargets?: Array<{ id: string; email: string }>;
    onClose: () => void;
    onApplied: () => void;
}

const MAX_MB = 5;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

export default function ManagePersonaModal({ target, bulkTargets, onClose, onApplied }: Props) {
    const isBulk = !!bulkTargets && bulkTargets.length > 0;
    const [displayName, setDisplayName] = useState(target?.displayName ?? '');
    const [imageUrl, setImageUrl] = useState<string | null>(target?.profileImage ?? null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setDisplayName(target?.displayName ?? '');
        setImageUrl(target?.profileImage ?? null);
        setError(null);
    }, [target?.id]);

    const pickFile = () => fileInputRef.current?.click();

    const handleFile = async (file: File) => {
        setError(null);
        if (file.size > MAX_MB * 1024 * 1024) {
            setError(`Image must be under ${MAX_MB} MB`);
            return;
        }
        if (!ACCEPT.split(',').includes(file.type)) {
            setError('Please upload a JPG, PNG, WebP, or GIF');
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await uploadPersonaImageAction(fd);
            if (!res.success || !res.url) {
                setError(res.error || 'Upload failed');
                return;
            }
            setImageUrl(res.url);
        } catch (e: any) {
            setError(e?.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    const handleSave = async () => {
        setError(null);
        setSaving(true);
        try {
            if (isBulk) {
                const ids = bulkTargets!.map(t => t.id);
                const res = await bulkApplyPersonaAction(ids, {
                    displayName: displayName.trim() || null,
                    profileImage: imageUrl,
                });
                if (!res.success) { setError(res.error || 'Apply failed'); return; }
            } else if (target) {
                const res = await updateAccountPersonaAction(target.id, {
                    displayName: displayName.trim() || null,
                    profileImage: imageUrl,
                });
                if (!res.success) { setError(res.error || 'Save failed'); return; }
            }
            onApplied();
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const handleClear = async () => {
        if (!target) return;
        setClearing(true);
        try {
            const res = await clearPersonaAction(target.id);
            if (!res.success) { setError(res.error || 'Clear failed'); return; }
            onApplied();
            onClose();
        } finally {
            setClearing(false);
        }
    };

    const subjectLabel = isBulk
        ? `Applying to ${bulkTargets!.length} account${bulkTargets!.length === 1 ? '' : 's'}`
        : target!.email;

    const gravatarEmails = isBulk ? bulkTargets!.map(t => t.email) : target ? [target.email] : [];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-box animate-slide-in persona-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="persona-modal-title"
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-title" id="persona-modal-title">
                    {isBulk ? 'Apply persona to selection' : 'Manage persona'}
                </div>
                <div className="modal-sub">{subjectLabel}</div>

                {/* Preview + drop zone */}
                <div
                    className={`persona-drop ${dragActive ? 'is-active' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    onClick={pickFile}
                >
                    {imageUrl ? (
                        <img src={imageUrl} alt="Persona preview" className="persona-preview" />
                    ) : (
                        <div className="persona-preview persona-preview-empty" aria-hidden="true">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                                <circle cx="12" cy="8" r="4" />
                                <path d="M4 21c0-4.42 3.58-8 8-8s8 3.58 8 8" />
                            </svg>
                        </div>
                    )}
                    <div className="persona-drop-text">
                        <div className="persona-drop-title">{imageUrl ? 'Replace photo' : 'Upload profile photo'}</div>
                        <div className="persona-drop-sub">Click or drag & drop · JPG/PNG/WebP · max {MAX_MB} MB</div>
                    </div>
                    {uploading && <div className="persona-uploading">Uploading…</div>}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPT}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                        style={{ display: 'none' }}
                    />
                </div>

                {/* Display name */}
                <label className="persona-field">
                    <span className="persona-field-label">Display name</span>
                    <input
                        type="text"
                        className="input"
                        placeholder="e.g. Rafay Ahmed"
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        maxLength={64}
                    />
                    <span className="persona-field-hint">
                        Shown to recipients as <code>&quot;{displayName.trim() || '—'}&quot; &lt;{isBulk ? 'each address' : target!.email}&gt;</code>.
                        Leave empty to send from the bare email.
                    </span>
                </label>

                {/* Avatar reality hint — Phase 7 honesty pass.
                    The photo + display name we set here are used for in-app
                    display and the From-header on outbound MIME. Whether the
                    RECIPIENT actually sees the photo depends on the address: */}
                {(() => {
                    const isGmailAddr = (em: string) => /@(gmail\.com|googlemail\.com)$/i.test(em);
                    const allGmail = gravatarEmails.every(isGmailAddr);
                    const allCustom = gravatarEmails.every(em => !isGmailAddr(em));
                    return (
                        <div className="persona-gravatar">
                            <div className="persona-gravatar-title">How recipients see the photo</div>
                            <div className="persona-gravatar-body" style={{ marginBottom: 8 }}>
                                {allGmail && (
                                    <>
                                        These addresses are on <strong>@gmail.com</strong>. Gmail uses the photo
                                        on the sender&apos;s own Google profile — <strong>not</strong> our upload.
                                        Each owner needs to upload the same image at{' '}
                                        <a href="https://myaccount.google.com/personal-info" target="_blank" rel="noopener noreferrer">myaccount.google.com</a>.
                                    </>
                                )}
                                {allCustom && (
                                    <>
                                        These are custom-domain addresses. Most non-Gmail clients (Apple Mail,
                                        Outlook on the web, Yahoo) read sender photos from <strong>Gravatar</strong>.
                                        Upload the image at gravatar.com using the address(es) below so those inboxes show it too.
                                    </>
                                )}
                                {!allGmail && !allCustom && (
                                    <>
                                        Mixed Gmail + custom-domain addresses. Gmail addresses need their photo
                                        set at <a href="https://myaccount.google.com/personal-info" target="_blank" rel="noopener noreferrer">myaccount.google.com</a>;
                                        custom domains need <strong>Gravatar</strong>. Click an address below to copy it.
                                    </>
                                )}
                            </div>
                            <div className="persona-gravatar-emails">
                                {gravatarEmails.slice(0, 3).map(em => (
                                    <button
                                        key={em}
                                        type="button"
                                        className="persona-email-chip"
                                        onClick={() => navigator.clipboard?.writeText(em)}
                                        title={isGmailAddr(em) ? 'Copy email — set photo at myaccount.google.com' : 'Copy email — register at gravatar.com'}
                                    >
                                        {em}
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="9" y="9" width="13" height="13" rx="2" />
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                    </button>
                                ))}
                                {gravatarEmails.length > 3 && <span className="persona-email-more">+{gravatarEmails.length - 3} more</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                                {!allGmail && (
                                    <a
                                        href="https://gravatar.com/profile/avatars"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="persona-gravatar-link"
                                    >
                                        Open Gravatar →
                                    </a>
                                )}
                                {!allCustom && (
                                    <a
                                        href="https://myaccount.google.com/personal-info"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="persona-gravatar-link"
                                    >
                                        Open Google profile →
                                    </a>
                                )}
                            </div>
                            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                                Note: there&apos;s no Google API that lets us push a profile photo for you.
                                The owner has to set it themselves.
                            </div>
                        </div>
                    );
                })()}

                {error && <div className="persona-error">{error}</div>}

                <div className="persona-actions">
                    {!isBulk && (target!.displayName || target!.profileImage) && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-danger-text"
                            onClick={handleClear}
                            disabled={clearing || saving}
                        >
                            {clearing ? 'Clearing…' : 'Clear persona'}
                        </button>
                    )}
                    <div className="persona-actions-right">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSave}
                            disabled={saving || uploading}
                        >
                            {saving ? 'Saving…' : isBulk ? `Apply to ${bulkTargets!.length}` : 'Save persona'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
