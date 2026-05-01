'use client';

import React, { useState, useEffect } from 'react';
import Topbar from '../components/Topbar';
import { useRouter } from 'next/navigation';
import { useGlobalFilter } from '../context/FilterContext';

interface SettingRow {
    id: string;
    title: string;
    description: string;
    value: boolean;
    onChange: (v: boolean) => void;
}

export default function SettingsClient() {
    const router = useRouter();
    const { selectedAccountId, setSelectedAccountId, accounts } = useGlobalFilter();
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

    const savedTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const handleSave = () => {
        localStorage.setItem('settings_polling_enabled', pollingEnabled.toString());
        localStorage.setItem('settings_polling_interval', pollingInterval.toString());
        localStorage.setItem('settings_focus_sync_enabled', focusSyncEnabled.toString());
        localStorage.setItem('settings_notifications_enabled', notificationsEnabled.toString());
        setIsSaved(true);
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setIsSaved(false), 3000);
    };

    useEffect(() => () => clearTimeout(savedTimerRef.current), []);

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
        <div className="mailbox-wrapper">
            <div className="main-area">
                {/* Topbar */}
                <Topbar
                    searchTerm=""
                    setSearchTerm={() => { }}
                    placeholder="Search settings..."
                    onSearch={() => { }}
                    onClearSearch={() => { }}
                    leftContent={
                        <h1 className="settings-page-title">Settings</h1>
                    }
                    rightContent={
                        <div className="topbar-actions">
                            <span className="settings-admin-label">Admin</span>
                            <div className="avatar-btn">A</div>
                        </div>
                    }
                />

                {/* Content */}
                <div className="settings-content">
                    <div className="settings-container">

                        {/* Sync Preferences Card */}
                        <div className="card settings-card">
                            <div className="settings-card-header">
                                <h2 className="settings-section-title">
                                    Sync Preferences
                                </h2>
                                <p className="settings-section-desc">
                                    Control how Unibox fetches your emails in the background.
                                </p>
                            </div>

                            <div className="settings-toggle-list">
                                {toggleRows.map((row, i) => (
                                    <div
                                        key={row.id}
                                        className="settings-toggle-row"
                                        style={{
                                            borderBottom: i < toggleRows.length - 1 ? '1px solid var(--border)' : 'none',
                                        }}
                                    >
                                        <div className="settings-toggle-info">
                                            <div className="settings-toggle-title">
                                                {row.title}
                                            </div>
                                            <div className="settings-toggle-desc">
                                                {row.description}
                                            </div>
                                        </div>
                                        <label
                                            className="toggle-switch"
                                            htmlFor={`toggle-${row.id}`}
                                            style={{ flexShrink: 0 }}
                                        >
                                            <input
                                                type="checkbox"
                                                id={`toggle-${row.id}`}
                                                checked={row.value}
                                                onChange={e => row.onChange(e.target.checked)}
                                                aria-label={`Toggle ${row.title}`}
                                            />
                                            <span className="toggle-track" />
                                        </label>
                                    </div>
                                ))}
                            </div>

                            {/* Polling interval slider */}
                            {pollingEnabled && (
                                <div className="settings-interval-box">
                                    <div className="settings-interval-header">
                                        <label className="settings-interval-label" htmlFor="polling-interval">
                                            Check interval
                                        </label>
                                        <span className="settings-interval-badge">
                                            {pollingInterval}s
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        id="polling-interval"
                                        min="5"
                                        max="300"
                                        step="5"
                                        value={pollingInterval}
                                        onChange={e => setPollingInterval(parseInt(e.target.value, 10))}
                                        aria-label={`Polling interval: ${pollingInterval} seconds`}
                                        className="settings-range-input"
                                    />
                                    <div className="settings-interval-range-labels">
                                        <span>5s (fastest)</span>
                                        <span>5m (slowest)</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* About Card */}
                        <div className="card settings-card">
                            <h2 className="settings-section-title" style={{ marginBottom: '16px' }}>
                                About Unibox
                            </h2>
                            <div className="settings-about-list">
                                {[
                                    ['Version', '1.0.0'],
                                    ['Framework', 'Next.js 14 (App Router)'],
                                    ['Database', 'Supabase (PostgreSQL)'],
                                    ['Email Provider', 'Google Gmail API + IMAP/SMTP'],
                                ].map(([label, val]) => (
                                    <div key={label} className="settings-about-row">
                                        <span className="settings-about-label">{label}</span>
                                        <span className="settings-about-value">{val}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Save */}
                        <div className="settings-save-row">
                            <button
                                onClick={handleSave}
                                className="btn btn-primary btn-lg settings-save-btn"
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
            </div>
            <style jsx>{`
                .settings-page-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--text-primary);
                    margin: 0;
                }
                .settings-admin-label {
                    color: var(--text-secondary);
                    font-size: 0.8125rem;
                }
                .settings-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 2rem;
                }
                .settings-container {
                    max-width: 680px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }
                .settings-card {
                    padding: 1.5rem;
                }
                .settings-card-header {
                    margin-bottom: 24px;
                }
                .settings-section-title {
                    font-size: 1rem;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 3px;
                }
                .settings-section-desc {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                }
                .settings-toggle-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0;
                }
                .settings-toggle-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 0;
                }
                .settings-toggle-info {
                    flex: 1;
                    padding-right: 24px;
                }
                .settings-toggle-title {
                    font-weight: 600;
                    font-size: 0.875rem;
                    margin-bottom: 3px;
                    color: var(--text-primary);
                }
                .settings-toggle-desc {
                    font-size: 0.775rem;
                    color: var(--text-muted);
                    line-height: 1.5;
                }
                .settings-interval-box {
                    margin-top: 16px;
                    background: var(--bg-elevated);
                    border: 1px solid var(--border);
                    border-radius: var(--radius-md);
                    padding: 16px;
                }
                .settings-interval-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
                .settings-interval-label {
                    font-size: 0.8rem;
                    color: var(--text-secondary);
                    font-weight: 500;
                }
                .settings-interval-badge {
                    background: var(--accent-light);
                    color: var(--text-accent);
                    font-size: 0.775rem;
                    font-weight: 700;
                    padding: 2px 10px;
                    border-radius: var(--radius-full);
                    border: 1px solid rgba(79,140,255,0.2);
                }
                .settings-range-input {
                    width: 100%;
                    accent-color: var(--accent);
                    cursor: pointer;
                }
                .settings-interval-range-labels {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 6px;
                    font-size: 0.68rem;
                    color: var(--text-muted);
                }
                .settings-about-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .settings-about-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.8125rem;
                    padding: 6px 0;
                    border-bottom: 1px solid var(--border);
                }
                .settings-about-label {
                    color: var(--text-muted);
                }
                .settings-about-value {
                    color: var(--text-secondary);
                    font-weight: 500;
                }
                .settings-save-row {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                }
                .settings-save-btn {
                    min-width: 140px;
                }
                .settings-save-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
}
