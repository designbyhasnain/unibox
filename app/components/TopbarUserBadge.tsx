'use client';

import React from 'react';
import { initials as nameInitials } from '../utils/nameDisplay';

/**
 * Tiny topbar avatar — shows the real logged-in user's photo (or a clean
 * initials circle as fallback). Hydrates from the same localStorage keys the
 * Sidebar already populates (`unibox_user_name` / `unibox_user_avatar`) so
 * there's no second DB roundtrip on mount; live updates come in via the
 * existing `unibox:profile-updated` CustomEvent + cross-tab `storage` events.
 *
 * Click dispatches `unibox:open-account-settings` — Sidebar listens for this
 * and opens its AccountSettingsModal. We don't render the modal here so we
 * keep a single source of truth for it (avoids two modals layered on click).
 */
export default function TopbarUserBadge() {
    const [name, setName] = React.useState('');
    const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
        try {
            setName(localStorage.getItem('unibox_user_name') || '');
            setAvatarUrl(localStorage.getItem('unibox_user_avatar'));
        } catch {}

        const onProfileUpdated = (e: Event) => {
            const detail = (e as CustomEvent<{ name?: string; avatarUrl?: string | null }>).detail || {};
            if (typeof detail.name === 'string') setName(detail.name);
            if (detail.avatarUrl !== undefined) setAvatarUrl(detail.avatarUrl);
        };
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'unibox_user_name' && e.newValue !== null) setName(e.newValue);
            if (e.key === 'unibox_user_avatar') setAvatarUrl(e.newValue || null);
        };
        window.addEventListener('unibox:profile-updated', onProfileUpdated);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener('unibox:profile-updated', onProfileUpdated);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    const open = () => {
        window.dispatchEvent(new CustomEvent('unibox:open-account-settings'));
    };

    // Skeleton until mount so SSR + client agree on the same DOM shape and
    // we don't flash a fallback initial that doesn't match the cached avatar.
    if (!mounted) {
        return <div className="topbar-user-badge topbar-user-badge--skel" aria-hidden="true" />;
    }

    const ini = nameInitials(name, 'U');
    return (
        <button
            type="button"
            className="topbar-user-badge"
            onClick={open}
            title={name ? `${name} — account settings` : 'Account settings'}
            aria-label="Open account settings"
        >
            {avatarUrl ? (
                <img
                    src={avatarUrl}
                    alt={name || 'You'}
                    className="topbar-user-badge-img"
                    referrerPolicy="no-referrer"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
            ) : (
                <span className="topbar-user-badge-initials">{ini}</span>
            )}
        </button>
    );
}
