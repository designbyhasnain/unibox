'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { Eye, EyeOff, X, Check, Camera, Loader2 } from 'lucide-react';
import { updateOwnNameAction, changeOwnPasswordAction, uploadOwnAvatarAction, getCurrentUserAction, getSessionPayloadAction } from '../../src/actions/authActions';
import { useUndoToast } from '../context/UndoToastContext';
import { useDialogShell } from '../hooks/useDialogShell';

interface Props {
    onClose: () => void;
    onUpdated?: () => void;
    /** Pre-fill from caller (sidebar) so the modal renders populated immediately
     *  instead of blank-then-flash. The server fetch still runs to refresh. */
    initialName?: string;
    initialEmail?: string;
    initialAvatarUrl?: string | null;
}

type Tab = 'profile' | 'password';

// Hydrate from the sidebar's localStorage cache so the first paint is never
// blank. Falls back to '' / null when keys are missing or storage is disabled.
const cachedName = (): string => {
    try { return localStorage.getItem('unibox_user_name') || ''; } catch { return ''; }
};
const cachedEmail = (): string => {
    try { return localStorage.getItem('unibox_user_email') || ''; } catch { return ''; }
};
const cachedAvatar = (): string | null => {
    try { return localStorage.getItem('unibox_user_avatar') || null; } catch { return null; }
};

export default function AccountSettingsModal({ onClose, onUpdated, initialName, initialEmail, initialAvatarUrl }: Props) {
    const { showError } = useUndoToast();
    const [tab, setTab] = useState<Tab>('profile');
    const { dialogRef } = useDialogShell({ onClose });

    // Profile — seeded from props → localStorage → '' so the inputs are
    // populated on first render with ZERO server roundtrip. The Stage 2
    // DB fetch only runs to pick up a fresh avatar.
    const seededName = initialName ?? cachedName();
    const seededEmail = initialEmail ?? cachedEmail();
    const seededAvatar = initialAvatarUrl !== undefined ? initialAvatarUrl : cachedAvatar();
    const [name, setName] = useState(seededName);
    const [originalName, setOriginalName] = useState(seededName);
    const [email, setEmail] = useState(seededEmail);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(seededAvatar);
    // Phase 11: useTransition for non-blocking server writes. The user never
    // sees a "Saving…" spinner on the optimistic path — they see the green
    // Saved checkmark IMMEDIATELY. The transition runs the server call in
    // the background; isPending is only used for the rollback-on-error UX.
    const [, startNameTransition] = useTransition();
    const [nameSaved, setNameSaved] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [avatarError, setAvatarError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Password
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [passwordSaved, setPasswordSaved] = useState(false);
    const [passwordError, setPasswordError] = useState('');

    useEffect(() => {
        let cancelled = false;

        // Phase 11: TWO-STAGE LOAD that NEVER clobbers seeded values.
        //
        // Stage 1 (instant): pull email/name from the signed session cookie.
        // Only overwrites our state when we DON'T already have a value from
        // props or cache — so a sidebar that already passed initialEmail
        // never sees its value get blanked then refilled.
        //
        // Stage 2 (background): refresh avatar_url from DB. Errors here are
        // silent — the seeded values stay.
        getSessionPayloadAction().then(s => {
            if (cancelled || !s) return;
            setEmail(prev => prev || s.email || '');
            setName(prev => prev || s.name || '');
            setOriginalName(prev => prev || s.name || '');
            // Persist email locally too so future modal opens are fully
            // populated even before this effect runs.
            try { if (s.email) localStorage.setItem('unibox_user_email', s.email); } catch {}
        });

        getCurrentUserAction()
            .then(u => {
                if (cancelled || !u) return;
                // Only overwrite if the DB has DIFFERENT data than what we
                // already have — prevents the "blank for 1 frame, then fill"
                // flicker when the seed was already correct.
                if (u.name && u.name !== name) {
                    setName(u.name);
                    setOriginalName(u.name);
                }
                if (u.email && u.email !== email) setEmail(u.email);
                if (u.avatarUrl !== undefined && u.avatarUrl !== avatarUrl) {
                    setAvatarUrl(u.avatarUrl);
                }
            })
            .catch((err) => {
                if (cancelled) return;
                console.warn('[AccountSettings] DB refresh failed, keeping session-only data:', err);
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const initials = (name || email || '?').split(/[ @]/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

    const handlePickAvatar = () => {
        fileInputRef.current?.click();
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAvatarError(null);

        // Quick client-side guard so the user gets instant feedback before
        // we even hit the server.
        if (file.size > 5 * 1024 * 1024) { setAvatarError('Image too large (max 5 MB)'); return; }
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
            setAvatarError('Use JPG, PNG, WebP or GIF'); return;
        }

        // Optimistic preview while uploading — we read the file as a data URL
        // so the new image shows immediately, then swap to the real CDN URL
        // when the upload finishes.
        const localPreview = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
        setAvatarUrl(localPreview);

        setUploadingAvatar(true);
        const fd = new FormData();
        fd.append('file', file);
        const res = await uploadOwnAvatarAction(fd);
        setUploadingAvatar(false);

        if (res.success && res.url) {
            setAvatarUrl(res.url);
            try { localStorage.setItem('unibox_user_avatar', res.url); } catch {}
            // Phase 10: dispatch a synchronous custom event so the sidebar
            // updates in the same tick — no waiting for refreshProfile to
            // round-trip the server.
            try {
                window.dispatchEvent(new CustomEvent('unibox:profile-updated', {
                    detail: { avatarUrl: res.url },
                }));
            } catch {}
            onUpdated?.();
        } else {
            // Roll back preview to whatever was on the user before the picker.
            setAvatarUrl(prev => prev?.startsWith('data:') ? null : prev);
            setAvatarError(res.error || 'Upload failed');
            showError(`Couldn't upload avatar: ${res.error || 'unknown error'}`);
        }
        // Allow re-uploading the same filename later by clearing the input.
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSaveName = () => {
        if (!name.trim() || name === originalName) return;

        // Phase 11: PURELY OPTIMISTIC. The user sees Saved ✓ immediately.
        // No "Saving…" state — the server write runs in a background
        // transition. On error we rollback + show a retry toast.
        const optimisticName = name;
        const previousOriginal = originalName;

        // 1. Synchronous UI flip — Saved badge, sidebar event, localStorage.
        setOriginalName(optimisticName);
        setNameSaved(true);
        try { localStorage.setItem('unibox_user_name', optimisticName); } catch {}
        try {
            window.dispatchEvent(new CustomEvent('unibox:profile-updated', {
                detail: { name: optimisticName },
            }));
        } catch {}
        onUpdated?.();

        // 2. Schedule the Saved badge to fade after 2s — this is independent
        //    of the server response. Even on a slow network, the user sees
        //    a clean "Saved → fade" interaction.
        setTimeout(() => setNameSaved(false), 2000);

        // 3. Background server write via useTransition — never blocks the UI.
        startNameTransition(async () => {
            try {
                const res = await updateOwnNameAction(optimisticName);
                if (!res.success) {
                    setOriginalName(previousOriginal);
                    setName(previousOriginal);
                    try { localStorage.setItem('unibox_user_name', previousOriginal); } catch {}
                    try {
                        window.dispatchEvent(new CustomEvent('unibox:profile-updated', {
                            detail: { name: previousOriginal },
                        }));
                    } catch {}
                    showError(`Couldn't update name: ${res.error}`, { onRetry: handleSaveName });
                }
            } catch (err: unknown) {
                setOriginalName(previousOriginal);
                setName(previousOriginal);
                try { localStorage.setItem('unibox_user_name', previousOriginal); } catch {}
                try {
                    window.dispatchEvent(new CustomEvent('unibox:profile-updated', {
                        detail: { name: previousOriginal },
                    }));
                } catch {}
                showError("Couldn't update name. Check your connection.", { onRetry: handleSaveName });
            }
        });
    };

    const handleChangePassword = async () => {
        setPasswordError('');
        if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters'); return; }
        if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
        setSavingPassword(true);
        const res = await changeOwnPasswordAction(currentPassword, newPassword);
        setSavingPassword(false);
        if (res.success) {
            setPasswordSaved(true);
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
            setTimeout(() => { setPasswordSaved(false); }, 2500);
        } else {
            setPasswordError(res.error);
        }
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 10000,
                background: 'var(--bg-overlay)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
            }}
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="account-settings-title"
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--shell)', color: 'var(--ink)',
                    border: '1px solid var(--hairline)', borderRadius: 14,
                    width: '100%', maxWidth: 480,
                    boxShadow: 'var(--shadow-shell)',
                    overflow: 'hidden',
                    animation: 'modalSlideIn 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', borderBottom: '1px solid var(--hairline-soft)',
                }}>
                    <div>
                        <h2 id="account-settings-title" style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Account settings</h2>
                        <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: '2px 0 0' }}>{email}</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--ink-muted)', padding: 4, display: 'flex',
                    }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--hairline-soft)' }}>
                    {(['profile', 'password'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            style={{
                                flex: 1, padding: '11px 16px', fontSize: 13, fontWeight: 500,
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: tab === t ? 'var(--ink)' : 'var(--ink-muted)',
                                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                                textTransform: 'capitalize',
                            }}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div style={{ padding: 20 }}>
                    {tab === 'profile' && (
                        <>
                            <Field label="Profile photo">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <button
                                        type="button"
                                        onClick={handlePickAvatar}
                                        disabled={uploadingAvatar}
                                        aria-label="Change profile photo"
                                        style={{
                                            position: 'relative',
                                            width: 64, height: 64, borderRadius: '50%',
                                            border: '1px solid var(--hairline)',
                                            background: avatarUrl ? 'transparent' : 'var(--surface-2)',
                                            color: 'var(--ink-muted)',
                                            display: 'grid', placeItems: 'center',
                                            cursor: uploadingAvatar ? 'wait' : 'pointer',
                                            overflow: 'hidden',
                                            padding: 0,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {avatarUrl ? (
                                            <img
                                                src={avatarUrl}
                                                alt={name || 'You'}
                                                referrerPolicy="no-referrer"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                        ) : (
                                            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink-2)' }}>{initials}</span>
                                        )}
                                        {uploadingAvatar && (
                                            <span style={{
                                                position: 'absolute', inset: 0,
                                                background: 'color-mix(in oklab, var(--canvas), transparent 25%)',
                                                display: 'grid', placeItems: 'center',
                                            }}>
                                                <Loader2 size={20} style={{ animation: 'jarvis-spin 0.9s linear infinite', color: 'var(--ink)' }} />
                                            </span>
                                        )}
                                    </button>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <button
                                            type="button"
                                            onClick={handlePickAvatar}
                                            disabled={uploadingAvatar}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                padding: '6px 12px',
                                                background: 'var(--surface-2)',
                                                border: '1px solid var(--hairline)',
                                                borderRadius: 8,
                                                color: 'var(--ink-2)',
                                                fontSize: 12, fontWeight: 500,
                                                cursor: uploadingAvatar ? 'wait' : 'pointer',
                                            }}
                                        >
                                            <Camera size={13} />
                                            {uploadingAvatar ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload photo'}
                                        </button>
                                        <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                                            JPG, PNG, WebP or GIF · up to 5 MB
                                        </div>
                                        {avatarError && (
                                            <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>{avatarError}</div>
                                        )}
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        onChange={handleAvatarChange}
                                        hidden
                                    />
                                </div>
                            </Field>
                            <Field label="Display name">
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Your name"
                                    style={inputStyle}
                                />
                            </Field>
                            <Field label="Email">
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="email"
                                        value={email}
                                        disabled
                                        placeholder=""
                                        style={{ ...inputStyle, color: 'var(--ink-muted)', cursor: 'not-allowed' }}
                                    />
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4, display: 'block' }}>
                                    Email is set on the User record and can&apos;t be changed here. Contact an admin if you need to change it.
                                </span>
                            </Field>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                                {nameSaved && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--coach)', alignSelf: 'center' }}>
                                        <Check size={14} /> Saved
                                    </span>
                                )}
                                <button
                                    onClick={handleSaveName}
                                    disabled={!name.trim() || name === originalName}
                                    style={primaryBtn(!name.trim() || name === originalName)}
                                >
                                    Save name
                                </button>
                            </div>
                        </>
                    )}

                    {tab === 'password' && (
                        <>
                            <Field label="Current password">
                                <PasswordInput
                                    value={currentPassword}
                                    onChange={setCurrentPassword}
                                    show={showCurrent}
                                    setShow={setShowCurrent}
                                    placeholder="Leave empty if you've never set one"
                                />
                            </Field>
                            <Field label="New password">
                                <PasswordInput
                                    value={newPassword}
                                    onChange={setNewPassword}
                                    show={showNew}
                                    setShow={setShowNew}
                                    placeholder="At least 8 characters"
                                />
                            </Field>
                            <Field label="Confirm new password">
                                <PasswordInput
                                    value={confirmPassword}
                                    onChange={setConfirmPassword}
                                    show={showNew}
                                    setShow={setShowNew}
                                    placeholder="Type it again"
                                />
                            </Field>
                            {passwordError && (
                                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{passwordError}</div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                                {passwordSaved && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--coach)', alignSelf: 'center' }}>
                                        <Check size={14} /> Password updated
                                    </span>
                                )}
                                <button
                                    onClick={handleChangePassword}
                                    disabled={savingPassword || newPassword.length < 8 || !confirmPassword}
                                    style={primaryBtn(savingPassword || newPassword.length < 8 || !confirmPassword)}
                                >
                                    {savingPassword ? 'Saving…' : 'Change password'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)', marginBottom: 6 }}>
                {label}
            </span>
            {children}
        </label>
    );
}

function PasswordInput({ value, onChange, show, setShow, placeholder }: {
    value: string; onChange: (v: string) => void;
    show: boolean; setShow: (s: boolean) => void;
    placeholder?: string;
}) {
    return (
        <div style={{ position: 'relative' }}>
            <input
                type={show ? 'text' : 'password'}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                autoComplete="new-password"
                style={{ ...inputStyle, paddingRight: 36 }}
            />
            <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? 'Hide password' : 'Show password'}
                style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--ink-muted)', padding: 4, display: 'flex',
                }}
            >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid var(--hairline)',
    borderRadius: 8,
    background: 'var(--canvas)',
    color: 'var(--ink)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
};

const primaryBtn = (disabled: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    background: disabled ? 'var(--ink-muted)' : 'var(--ink)',
    color: 'var(--canvas)',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
});
