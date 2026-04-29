'use client';

import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, X, Check, Camera, Loader2 } from 'lucide-react';
import { updateOwnNameAction, changeOwnPasswordAction, uploadOwnAvatarAction, getCurrentUserAction } from '../../src/actions/authActions';
import { useUndoToast } from '../context/UndoToastContext';

interface Props {
    onClose: () => void;
    onUpdated?: () => void;
}

type Tab = 'profile' | 'password';

export default function AccountSettingsModal({ onClose, onUpdated }: Props) {
    const { showError } = useUndoToast();
    const [tab, setTab] = useState<Tab>('profile');

    // Profile
    const [name, setName] = useState('');
    const [originalName, setOriginalName] = useState('');
    const [email, setEmail] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [savingName, setSavingName] = useState(false);
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
        getCurrentUserAction().then(u => {
            if (u) {
                setName(u.name || '');
                setOriginalName(u.name || '');
                setEmail(u.email || '');
                setAvatarUrl(u.avatarUrl || null);
            }
        });
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

    const handleSaveName = async () => {
        if (!name.trim() || name === originalName) return;
        setSavingName(true);
        const res = await updateOwnNameAction(name);
        setSavingName(false);
        if (res.success) {
            setOriginalName(name);
            setNameSaved(true);
            setTimeout(() => setNameSaved(false), 2000);
            try { localStorage.setItem('unibox_user_name', res.name); } catch {}
            onUpdated?.();
        } else {
            showError(`Couldn't update name: ${res.error}`, { onRetry: handleSaveName });
        }
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
                        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Account settings</h2>
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
                                <input
                                    type="email"
                                    value={email}
                                    disabled
                                    style={{ ...inputStyle, color: 'var(--ink-muted)', cursor: 'not-allowed' }}
                                />
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
                                    disabled={savingName || !name.trim() || name === originalName}
                                    style={primaryBtn(savingName || !name.trim() || name === originalName)}
                                >
                                    {savingName ? 'Saving…' : 'Save name'}
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
