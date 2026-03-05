'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { useRouter } from 'next/navigation';

interface SettingRow {
    id: string;
    title: string;
    description: string;
    value: boolean;
    onChange: (v: boolean) => void;
}

export default function SettingsPage() {
    const router = useRouter();
    const [pollingEnabled, setPollingEnabled] = useState(true);
    const [pollingInterval, setPollingInterval] = useState(30);
    const [focusSyncEnabled, setFocusSyncEnabled] = useState(true);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        const savedPolling = localStorage.getItem('settings_polling_enabled');
        const savedInterval = localStorage.getItem('settings_polling_interval');
        const savedFocus = localStorage.getItem('settings_focus_sync_enabled');
        const savedNotifs = localStorage.getItem('settings_notifications_enabled');
        if (savedPolling !== null) setPollingEnabled(savedPolling === 'true');
        if (savedInterval !== null) setPollingInterval(parseInt(savedInterval, 10));
        if (savedFocus !== null) setFocusSyncEnabled(savedFocus === 'true');
        if (savedNotifs !== null) setNotificationsEnabled(savedNotifs === 'true');
    }, []);

    const handleSave = () => {
        localStorage.setItem('settings_polling_enabled', pollingEnabled.toString());
        localStorage.setItem('settings_polling_interval', pollingInterval.toString());
        localStorage.setItem('settings_focus_sync_enabled', focusSyncEnabled.toString());
        localStorage.setItem('settings_notifications_enabled', notificationsEnabled.toString());
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
    };

    const toggleRows: SettingRow[] = [
        {
            id: 'polling',
            title: 'Background Polling',
            description: 'Automatically check for new emails at regular intervals.',
            value: pollingEnabled,
            onChange: setPollingEnabled,
        },
        {
            id: 'focus',
            title: 'Focus Sync',
            description: 'Sync emails immediately when you return to this tab.',
            value: focusSyncEnabled,
            onChange: setFocusSyncEnabled,
        },
        {
            id: 'notifs',
            title: 'Desktop Notifications',
            description: 'Show a notification when new emails arrive.',
            value: notificationsEnabled,
            onChange: setNotificationsEnabled,
        },
    ];

    return (
        <>
            <Sidebar onOpenCompose={() => router.push('/')} />
            <main className="main-area">
                {/* Topbar */}
                <Topbar
                    searchTerm=""
                    setSearchTerm={() => { }}
                    placeholder="Search settings..."
                    onSearch={() => { }}
                    onClearSearch={() => { }}
                    leftContent={
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Settings</h1>
                    }
                    rightContent={
                        <div className="topbar-actions">
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>Admin</span>
                            <div className="avatar-btn">A</div>
                        </div>
                    }
                />

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                        {/* Sync Preferences Card */}
                        <div className="card" style={{ padding: '1.75rem' }}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                                    Sync Preferences
                                </h2>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Control how Unibox fetches your emails in the background.
                                </p>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                {toggleRows.map((row, i) => (
                                    <div
                                        key={row.id}
                                        style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                            padding: '1rem 0',
                                            borderBottom: i < toggleRows.length - 1 ? '1px solid var(--border)' : 'none',
                                        }}
                                    >
                                        <div style={{ flex: 1, paddingRight: '1.5rem' }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.2rem', color: 'var(--text-primary)' }}>
                                                {row.title}
                                            </div>
                                            <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                                {row.description}
                                            </div>
                                        </div>
                                        <label className="toggle-switch" style={{ flexShrink: 0 }}>
                                            <input
                                                type="checkbox"
                                                checked={row.value}
                                                onChange={e => row.onChange(e.target.checked)}
                                            />
                                            <span className="toggle-track" />
                                        </label>
                                    </div>
                                ))}
                            </div>

                            {/* Polling interval slider */}
                            {pollingEnabled && (
                                <div style={{
                                    marginTop: '1.25rem',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '1.125rem',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                            Check interval
                                        </label>
                                        <span style={{
                                            background: 'var(--accent-light)', color: 'var(--text-accent)',
                                            fontSize: '0.775rem', fontWeight: 700,
                                            padding: '2px 10px', borderRadius: 'var(--radius-full)',
                                            border: '1px solid rgba(79,140,255,0.2)'
                                        }}>
                                            {pollingInterval}s
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="5"
                                        max="300"
                                        step="5"
                                        value={pollingInterval}
                                        onChange={e => setPollingInterval(parseInt(e.target.value, 10))}
                                        style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                        <span>5s (fastest)</span>
                                        <span>5m (slowest)</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* About Card */}
                        <div className="card" style={{ padding: '1.75rem' }}>
                            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>
                                About Unibox
                            </h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {[
                                    ['Version', '1.0.0'],
                                    ['Framework', 'Next.js 14 (App Router)'],
                                    ['Database', 'Supabase (PostgreSQL)'],
                                    ['Email Provider', 'Google Gmail API + IMAP/SMTP'],
                                ].map(([label, val]) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                                        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{val}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Save */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                onClick={handleSave}
                                className="btn btn-primary btn-lg"
                                style={{ minWidth: 140 }}
                            >
                                {isSaved ? (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                        Saved!
                                    </>
                                ) : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </>
    );
}
