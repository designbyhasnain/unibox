'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Topbar from '../components/Topbar';
import { getAnalyticsDataAction } from '../../src/actions/analyticsActions';
import { getAccountsAction } from '../../src/actions/accountActions';
import { getManagersAction } from '../../src/actions/projectActions';
import { useGlobalFilter } from '../context/FilterContext';
import { PageLoader } from '../components/LoadingStates';
import { useHydrated } from '../utils/useHydration';
import DateRangePicker from '../components/DateRangePicker';
import { getFromLocalCache, saveToLocalCache } from '../utils/localCache';

/* ── Lazy-load the heavy Recharts bundle ──────────────────────────── */
const AnalyticsCharts = dynamic(() => import('../components/AnalyticsCharts'), {
    loading: () => <div className="a-loading">Loading charts...</div>,
    ssr: false,
});

const ANALYTICS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/* ── Main page ────────────────────────────────────────────────────── */
export default function AnalyticsPage() {
    const { selectedAccountId, setSelectedAccountId, startDate, endDate, accounts } = useGlobalFilter();
    const [selectedManager, setSelectedManager] = useState('ALL');
    const [managers, setManagers] = useState<any[]>([]);
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isStale, setIsStale] = useState(false);
    const cacheTimestampRef = useRef<number>(0);
    const isHydrated = useHydrated();

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const cached = getFromLocalCache('analytics_data');
            if (cached) {
                setData(cached);
                setLoading(false);
                // Check staleness from localStorage metadata
                const cachedMeta = getFromLocalCache('analytics_data_ts');
                const ts = typeof cachedMeta === 'number' ? cachedMeta : 0;
                cacheTimestampRef.current = ts;
                setIsStale(Date.now() - ts > ANALYTICS_CACHE_TTL);
            }
        }
    }, []);

    useEffect(() => {
        const load = async () => {
            const mgrs = await getManagersAction();
            setManagers(mgrs);
        };
        load();
    }, []);

    useEffect(() => {
        if (!isHydrated) return;
        const fetch = async () => {
            if (!data) setLoading(true);
            setError(null);
            const result = await getAnalyticsDataAction({ startDate, endDate, managerId: selectedManager, accountId: selectedAccountId });
            if (result.success) {
                setData(result);
                const now = Date.now();
                cacheTimestampRef.current = now;
                saveToLocalCache('analytics_data', result);
                saveToLocalCache('analytics_data_ts', now);
                setIsStale(false);
            } else {
                setError(result.error || 'Failed to load analytics');
            }
            setLoading(false);
        };
        fetch();
    }, [startDate, endDate, selectedManager, selectedAccountId, isHydrated]);

    const stats = data?.stats;
    const hasData = isHydrated && data;

    /* ── KPI definitions ── */
    const hasClassification = (stats?.outreachFirst || 0) > 0 || (stats?.firstReplies || 0) > 0;
    const replyDetail = hasClassification
        ? `${(stats?.firstReplies || 0).toLocaleString()} first replies / ${(stats?.uniqueProspectsOutreached || 0).toLocaleString()} prospects`
        : `${stats?.totalReceived?.toLocaleString() || '0'} replies on ${stats?.totalOutreach?.toLocaleString() || '0'} sent`;
    const kpis = [
        { label: 'Total Emails', value: stats?.totalEmails?.toLocaleString() || '0', detail: `${stats?.totalOutreach?.toLocaleString() || '0'} sent, ${stats?.totalReceived?.toLocaleString() || '0'} received`, icon: <svg width="18" height="18" fill="none" stroke="#1a73e8" strokeWidth="2" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> },
        { label: 'Reply Rate', value: stats?.avgReplyRate || '0%', detail: replyDetail, icon: <svg width="18" height="18" fill="none" stroke="#1e8e3e" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg> },
        { label: 'Avg Response', value: `${stats?.avgResponseHours || '0'}h`, detail: `${stats?.totalThreads?.toLocaleString() || '0'} conversations`, icon: <svg width="18" height="18" fill="none" stroke="#f9ab00" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> },
        { label: 'Revenue', value: `$${(stats?.totalRevenue || 0).toLocaleString()}`, detail: `${stats?.closedDeals || 0} deals, avg $${(stats?.avgDealSize || 0).toLocaleString()}`, icon: <svg width="18" height="18" fill="none" stroke="#8430ce" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
    ];

    return (
        <div className="mailbox-wrapper">
            <div className="main-area a-main">
                <Topbar searchTerm="" setSearchTerm={() => {}} onSearch={() => {}} onClearSearch={() => {}} placeholder="Search analytics..." />

                {/* ── Filter bar ──────────────────────────────── */}
                <div className="a-filter-bar">
                    <h1 className="a-page-title">Analytics</h1>

                    <div className="a-filter-controls">
                        <DateRangePicker />
                        <select className="a-select" value={selectedManager} onChange={(e) => setSelectedManager(e.target.value)} aria-label="Filter by manager">
                            <option value="ALL">All Managers</option>
                            {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        <select className="a-select" value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} aria-label="Filter by account">
                            <option value="ALL">All Accounts</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
                        </select>
                    </div>

                    {isHydrated && loading && (
                        <div className="a-sync a-fade-in">
                            <div className="a-sync-dot" />
                            <span>Updating...</span>
                        </div>
                    )}

                    {isStale && !loading && (
                        <span className="a-stale-badge">Cached data</span>
                    )}

                    <button
                        className="a-refresh-btn"
                        onClick={() => {
                            setIsStale(false);
                            setLoading(true);
                            const doRefresh = async () => {
                                const result = await getAnalyticsDataAction({ startDate, endDate, managerId: selectedManager, accountId: selectedAccountId });
                                if (result.success) {
                                    setData(result);
                                    const now = Date.now();
                                    cacheTimestampRef.current = now;
                                    saveToLocalCache('analytics_data', result);
                                    saveToLocalCache('analytics_data_ts', now);
                                }
                                setLoading(false);
                            };
                            doRefresh();
                        }}
                        disabled={loading}
                        aria-label="Refresh analytics"
                        title="Refresh analytics data"
                    >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                        </svg>
                    </button>
                </div>

                {/* ── Content ─────────────────────────────────── */}
                <div className="a-scroll-area">
                    {error && (
                        <div className="a-error">
                            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
                            <span>{error}</span>
                        </div>
                    )}

                    <PageLoader isLoading={!isHydrated || (loading && !data)} type="grid">
                        {hasData && (
                            <AnalyticsCharts
                                data={data}
                                deviceData={null}
                                stats={stats}
                                kpis={kpis}
                            />
                        )}
                    </PageLoader>
                </div>
            </div>

            <style jsx global>{`
                /* ── Base ──────────────────────────────────── */
                .a-main {
                    background: var(--bg-base);
                }
                .a-scroll-area {
                    flex: 1;
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                }
                .a-content {
                    padding: var(--space-2xl);
                    max-width: 1600px;
                    margin: 0 auto;
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-xl);
                }

                /* ── Filter bar ────────────────────────────── */
                .a-filter-bar {
                    padding: var(--space-lg) var(--space-2xl);
                    background: var(--bg-surface);
                    border-bottom: 1px solid var(--border);
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    position: sticky;
                    top: 0;
                    z-index: 100;
                }
                .a-page-title {
                    font-size: var(--text-xl);
                    font-weight: var(--font-bold);
                    color: var(--text-primary);
                    letter-spacing: -0.02em;
                    white-space: nowrap;
                }
                .a-filter-controls {
                    display: flex;
                    align-items: center;
                    gap: var(--space-md);
                    margin-left: var(--space-xl);
                }
                .a-select {
                    appearance: none;
                    background: var(--bg-elevated);
                    border: 1px solid var(--border);
                    padding: var(--space-sm) 32px var(--space-sm) 14px;
                    border-radius: var(--radius-sm);
                    font-size: var(--text-sm);
                    font-weight: var(--font-medium);
                    color: var(--text-primary);
                    cursor: pointer;
                    outline: none;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%235f6368' stroke-width='2'%3E%3Cpath d='M3 4.5l3 3 3-3'/%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 12px center;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                .a-select:hover {
                    border-color: var(--text-muted);
                }
                .a-select:focus-visible {
                    border-color: var(--accent);
                    box-shadow: 0 0 0 3px var(--accent-light);
                }
                .a-sync {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    margin-left: auto;
                    font-size: var(--text-xs);
                    font-weight: var(--font-medium);
                    color: var(--text-muted);
                }
                .a-sync-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: var(--accent);
                    animation: a-pulse 1.8s ease-in-out infinite;
                }
                @keyframes a-pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }

                /* ── Stats row ─────────────────────────────── */
                .a-stats-row {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: var(--space-lg);
                }
                .a-stat {
                    background: var(--bg-surface);
                    border-radius: var(--radius-lg);
                    padding: 20px 24px;
                    border: 1px solid var(--border);
                    box-shadow: var(--shadow-sm);
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .a-stat:hover {
                    border-color: var(--accent);
                    box-shadow: var(--shadow-md);
                }
                .a-stat-top {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    margin-bottom: var(--space-md);
                }
                .a-stat-icon {
                    width: 32px;
                    height: 32px;
                    border-radius: var(--radius-sm);
                    background: var(--bg-elevated);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }
                .a-stat-label {
                    font-size: var(--text-sm);
                    font-weight: var(--font-medium);
                    color: var(--text-muted);
                }
                .a-stat-value {
                    font-size: 1.75rem;
                    font-weight: var(--font-bold);
                    color: var(--text-primary);
                    letter-spacing: -0.02em;
                    line-height: 1.1;
                }
                .a-stat-detail {
                    font-size: var(--text-sm);
                    color: var(--text-secondary);
                    margin-top: 6px;
                    font-weight: var(--font-normal);
                }

                /* ── Cards & Grid ──────────────────────────── */
                .a-grid {
                    display: grid;
                    grid-template-columns: repeat(12, 1fr);
                    gap: var(--space-lg);
                }
                .a-card {
                    background: var(--bg-surface);
                    border-radius: var(--radius-lg);
                    padding: var(--space-xl);
                    border: 1px solid var(--border);
                    box-shadow: var(--shadow-sm);
                }
                .a-card--7 { grid-column: span 7; }
                .a-card--5 { grid-column: span 5; }
                .a-card-full { width: 100%; }
                .a-card-header {
                    margin-bottom: 20px;
                }
                .a-card-title {
                    font-size: var(--text-lg);
                    font-weight: var(--font-semibold);
                    color: var(--text-primary);
                    letter-spacing: -0.02em;
                }
                .a-card-sub {
                    font-size: var(--text-sm);
                    color: var(--text-muted);
                    margin-top: 2px;
                    font-weight: var(--font-normal);
                }
                .a-chart-container {
                    width: 100%;
                }

                /* ── Sentiment / Reply Categories ──────────── */
                .a-sentiment-layout {
                    display: flex;
                    align-items: center;
                    gap: var(--space-xl);
                    min-height: 280px;
                }
                .a-pie-wrap {
                    flex: 1;
                    height: 280px;
                }
                .a-legend {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                .a-legend-item {}
                .a-legend-top {
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    margin-bottom: 6px;
                }
                .a-legend-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 3px;
                    flex-shrink: 0;
                }
                .a-legend-name {
                    font-size: var(--text-base);
                    color: var(--text-secondary);
                    font-weight: var(--font-medium);
                    flex: 1;
                }
                .a-legend-count {
                    font-size: var(--text-base);
                    font-weight: var(--font-semibold);
                    color: var(--text-primary);
                }
                .a-legend-bar {
                    height: 4px;
                    background: var(--bg-elevated);
                    border-radius: 2px;
                    overflow: hidden;
                }
                .a-legend-bar-fill {
                    height: 100%;
                    border-radius: 2px;
                }

                /* ── Table ─────────────────────────────────── */
                .a-table-wrap {
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
                .a-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .a-th {
                    text-align: left;
                    padding: 0 var(--space-lg) var(--space-md);
                    font-size: var(--text-xs);
                    font-weight: var(--font-semibold);
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: var(--text-muted);
                    border-bottom: 1px solid var(--border);
                }
                .a-th--right { text-align: right; }
                .a-tr {
                    transition: background 0.15s;
                }
                .a-tr:hover {
                    background: var(--bg-hover);
                }
                .a-td {
                    padding: 14px var(--space-lg);
                    font-size: var(--text-base);
                    color: var(--text-primary);
                    border-bottom: 1px solid var(--border);
                }
                .a-td--right { text-align: right; }
                .a-td--mono {
                    font-variant-numeric: tabular-nums;
                    font-weight: var(--font-semibold);
                }
                .a-manager-cell {
                    display: flex;
                    align-items: center;
                    gap: var(--space-md);
                }
                .a-avatar {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: var(--font-semibold);
                    font-size: var(--text-base);
                    flex-shrink: 0;
                }
                .a-manager-name {
                    font-weight: var(--font-semibold);
                    color: var(--text-primary);
                }
                .a-conv-cell {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .a-conv-track {
                    flex: 1;
                    height: 6px;
                    background: var(--bg-elevated);
                    border-radius: 3px;
                    overflow: hidden;
                    min-width: 60px;
                }
                .a-conv-fill {
                    height: 100%;
                    border-radius: 3px;
                    transition: width 0.4s ease;
                }
                .a-conv-label {
                    font-size: var(--text-sm);
                    font-weight: var(--font-semibold);
                    color: var(--text-secondary);
                    font-variant-numeric: tabular-nums;
                    min-width: 44px;
                    text-align: right;
                }

                /* ── Subjects list ─────────────────────────── */
                .a-subjects {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .a-subject-row {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 14px 12px;
                    border-radius: var(--radius-sm);
                    transition: background 0.15s;
                }
                .a-subject-row:hover {
                    background: var(--bg-hover);
                }
                .a-subject-rank {
                    width: 28px;
                    height: 28px;
                    border-radius: var(--radius-sm);
                    background: var(--bg-elevated);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: var(--text-xs);
                    font-weight: var(--font-semibold);
                    color: var(--text-muted);
                    flex-shrink: 0;
                }
                .a-subject-info {
                    flex: 1;
                    min-width: 0;
                }
                .a-subject-name {
                    font-size: var(--text-base);
                    font-weight: var(--font-medium);
                    color: var(--text-primary);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .a-subject-count {
                    font-size: var(--text-base);
                    font-weight: var(--font-semibold);
                    color: var(--text-primary);
                    white-space: nowrap;
                    font-variant-numeric: tabular-nums;
                }
                .a-subject-unit {
                    font-size: var(--text-xs);
                    font-weight: var(--font-normal);
                    color: var(--text-muted);
                }

                /* ── Device/Browser Breakdown ──────────────── */
                .a-grid--3 {
                    grid-template-columns: repeat(3, 1fr);
                    gap: var(--space-lg);
                }
                .a-card--4 { grid-column: span 1; }
                .a-breakdown-list {
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                }
                .a-breakdown-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .a-breakdown-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    min-width: 90px;
                    flex-shrink: 0;
                }
                .a-breakdown-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 2px;
                    flex-shrink: 0;
                }
                .a-breakdown-name {
                    font-size: var(--text-sm);
                    font-weight: var(--font-medium);
                    color: var(--text-primary);
                    white-space: nowrap;
                }
                .a-breakdown-bar-wrap {
                    flex: 1;
                    height: 6px;
                    background: var(--bg-elevated);
                    border-radius: 3px;
                    overflow: hidden;
                    min-width: 40px;
                }
                .a-breakdown-bar-fill {
                    height: 100%;
                    border-radius: 3px;
                }
                .a-breakdown-value {
                    font-size: var(--text-sm);
                    font-weight: var(--font-semibold);
                    color: var(--text-primary);
                    font-variant-numeric: tabular-nums;
                    white-space: nowrap;
                    min-width: 70px;
                    text-align: right;
                }
                .a-breakdown-pct {
                    font-weight: var(--font-normal);
                    color: var(--text-muted);
                    font-size: var(--text-xs);
                }

                /* ── CSS Animations (replacing framer-motion) ── */
                .a-fade-in {
                    animation: a-fadeIn 0.3s ease-out;
                }
                @keyframes a-fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .a-charts-fade-in {
                    animation: a-fadeIn 0.3s ease-out;
                }
                .a-kpi-stagger {
                    animation: a-slideUp 0.4s cubic-bezier(0.25, 1, 0.5, 1) both;
                }
                @keyframes a-slideUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .a-bar-animate {
                    animation: a-barGrow 0.6s cubic-bezier(0.25, 1, 0.5, 1) both;
                }
                @keyframes a-barGrow {
                    from { width: 0 !important; }
                }
                .a-loading {
                    padding: var(--space-2xl);
                    text-align: center;
                    font-size: var(--text-base);
                    color: var(--text-muted);
                }

                /* ── Stale badge & Refresh button ─────────── */
                .a-stale-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 3px 10px;
                    border-radius: 12px;
                    font-size: var(--text-xs);
                    font-weight: var(--font-medium);
                    color: #b45309;
                    background: #fef3c7;
                    border: 1px solid #fde68a;
                    margin-left: auto;
                    white-space: nowrap;
                }
                .a-refresh-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    border: 1px solid var(--border);
                    background: var(--bg-surface);
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all 0.15s;
                    flex-shrink: 0;
                }
                .a-refresh-btn:hover:not(:disabled) {
                    border-color: var(--accent);
                    color: var(--accent);
                    background: var(--bg-elevated);
                }
                .a-refresh-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                /* ── Error & Empty ─────────────────────────── */
                .a-error {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 14px 20px;
                    margin: var(--space-lg) var(--space-2xl);
                    background: var(--danger-light);
                    border: 1px solid var(--danger);
                    border-radius: var(--radius-md);
                    font-size: var(--text-base);
                    color: var(--danger);
                    font-weight: var(--font-medium);
                }
                .a-empty {
                    padding: var(--space-2xl) 0;
                    text-align: center;
                    font-size: var(--text-base);
                    color: var(--text-muted);
                }

                /* ── Responsive ────────────────────────────── */
                @media (max-width: 1200px) {
                    .a-stats-row {
                        grid-template-columns: repeat(2, 1fr);
                    }
                    .a-grid, .a-grid--3 {
                        grid-template-columns: 1fr;
                    }
                    .a-card--7, .a-card--5 {
                        grid-column: span 1;
                    }
                }
                @media (max-width: 768px) {
                    .a-content {
                        padding: var(--space-lg);
                    }
                    .a-filter-bar {
                        padding: var(--space-md) var(--space-lg);
                        flex-wrap: wrap;
                        gap: var(--space-md);
                    }
                    .a-filter-controls {
                        margin-left: 0;
                        flex-wrap: wrap;
                    }
                    .a-stats-row {
                        grid-template-columns: 1fr;
                    }
                    .a-stat-value {
                        font-size: 1.5rem;
                    }
                    .a-sentiment-layout {
                        flex-direction: column;
                    }
                    .a-pie-wrap {
                        width: 100%;
                        height: 220px;
                    }
                }
            `}</style>
        </div>
    );
}
