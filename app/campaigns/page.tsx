'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Topbar from '../components/Topbar';
import { useUI } from '../context/UIContext';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { saveToLocalCache, getFromLocalCache } from '../utils/localCache';
import { useUndoToast } from '../context/UndoToastContext';
import {
    getCampaignsAction,
    pauseCampaignAction,
    resumeCampaignAction,
    launchCampaignAction,
    deleteCampaignAction,
} from '../../src/actions/campaignActions';

// ─── Types ────────────────────────────────────────────────────────────────────

type Campaign = {
    id: string;
    name: string;
    goal: string;
    status: string;
    dailySendLimit: number;
    scheduledStartAt: string | null;
    createdAt: string;
    updatedAt: string;
    sendingAccount: { id: string; email: string } | null;
    createdBy: { id: string; name: string } | null;
    contactCount: number;
    activeContactCount: number;
    stepCount: number;
    sentCount: number;
    openRate: number;
    replyRate: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const GOAL_CONFIG: Record<string, { label: string; color: string }> = {
    COLD_OUTREACH: { label: 'Cold Outreach', color: 'badge-blue' },
    FOLLOW_UP: { label: 'Follow Up', color: 'badge-yellow' },
    RETARGETING: { label: 'Retargeting', color: 'badge-purple' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    DRAFT: { label: 'Draft', color: 'badge-gray' },
    SCHEDULED: { label: 'Scheduled', color: 'badge-blue' },
    RUNNING: { label: 'Running', color: 'badge-green' },
    PAUSED: { label: 'Paused', color: 'badge-yellow' },
    COMPLETED: { label: 'Completed', color: 'badge-purple' },
    ARCHIVED: { label: 'Archived', color: 'badge-red' },
};

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;
let globalCampaignsCache: Campaign[] | null = null;
let globalCampaignsCacheTimestamp = 0;

if (typeof window !== 'undefined') {
    const saved = getFromLocalCache('campaigns_data');
    if (saved) {
        globalCampaignsCache = saved;
        globalCampaignsCacheTimestamp = 0;
    }
}

function isCacheValid(): boolean {
    if (!globalCampaignsCache) return false;
    return Date.now() - globalCampaignsCacheTimestamp < CACHE_TTL_MS;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
    if (!dateStr) return '\u2014';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
    const isHydrated = useHydrated();
    const router = useRouter();
    const { isComposeOpen, setComposeOpen } = useUI();
    const { scheduleDelete } = useUndoToast();
    const [campaigns, setCampaigns] = useState<Campaign[]>(() => globalCampaignsCache || []);
    const [isLoading, setIsLoading] = useState(() => !globalCampaignsCache);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        loadCampaigns();
    }, []);

    async function loadCampaigns() {
        if (isCacheValid()) {
            setIsLoading(false);
            return;
        }
        try {
            if (!globalCampaignsCache) setIsLoading(true);
            const data = await getCampaignsAction();
            setCampaigns(data as unknown as Campaign[]);
            globalCampaignsCache = data as unknown as Campaign[];
            globalCampaignsCacheTimestamp = Date.now();
            saveToLocalCache('campaigns_data', data);
        } catch (err) {
            console.error('Failed to load campaigns:', err);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleAction(campaignId: string, action: 'launch' | 'pause' | 'resume' | 'archive') {
        setActionLoading(campaignId);
        try {
            let result: any;
            switch (action) {
                case 'launch':
                    result = await launchCampaignAction(campaignId);
                    break;
                case 'pause':
                    result = await pauseCampaignAction(campaignId);
                    break;
                case 'resume':
                    result = await resumeCampaignAction(campaignId);
                    break;
                case 'archive': {
                    const campaign = campaigns.find(c => c.id === campaignId);
                    if (!campaign) return;
                    setCampaigns(prev => prev.filter(c => c.id !== campaignId));
                    scheduleDelete({
                        id: campaignId,
                        type: 'campaign',
                        label: campaign.name || 'Campaign',
                        data: campaign,
                        deleteAction: () => deleteCampaignAction(campaignId),
                        onUndo: () => setCampaigns(prev => [...prev, campaign]),
                    });
                    setActionLoading(null);
                    return;
                }
            }
            if (result?.success) {
                globalCampaignsCacheTimestamp = 0;
                await loadCampaigns();
            }
        } finally {
            setActionLoading(null);
        }
    }

    const filtered = campaigns.filter(c => {
        if (filterStatus !== 'ALL' && c.status !== filterStatus) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return c.name.toLowerCase().includes(q) || c.sendingAccount?.email?.toLowerCase().includes(q);
        }
        return true;
    });

    const runningCount = campaigns.filter(c => c.status === 'RUNNING').length;
    const totalContacts = campaigns.reduce((sum, c) => sum + c.contactCount, 0);
    const avgOpenRate = campaigns.length > 0
        ? Math.round(campaigns.reduce((sum, c) => sum + c.openRate, 0) / campaigns.length)
        : 0;

    if (!isHydrated) return null;

    return (
        <div className="mailbox-wrapper">
            <Topbar
                searchTerm={searchQuery}
                setSearchTerm={setSearchQuery}
                onSearch={() => {}}
                onClearSearch={() => setSearchQuery('')}
                placeholder="Search campaigns..."
            />

            <div className="main-area" style={{ padding: '1.5rem', overflow: 'auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                            Campaigns
                        </h1>
                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            Automated email sequences for outreach and follow-ups
                        </p>
                    </div>
                    <Link
                        href="/campaigns/new"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            background: 'var(--accent)', color: '#fff', padding: '0.625rem 1.25rem',
                            borderRadius: 'var(--radius-full)', fontWeight: 500, fontSize: 'var(--text-sm)',
                            textDecoration: 'none', border: 'none', cursor: 'pointer',
                            transition: 'background var(--duration-fast) var(--ease)',
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14m-7-7h14" />
                        </svg>
                        New Campaign
                    </Link>
                </div>

                {/* Stats Bar */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem',
                }}>
                    {[
                        { label: 'Total Campaigns', value: campaigns.length },
                        { label: 'Running', value: runningCount },
                        { label: 'Contacts Enrolled', value: totalContacts },
                        { label: 'Avg Open Rate', value: `${avgOpenRate}%` },
                    ].map((stat) => (
                        <div key={stat.label} style={{
                            background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                            padding: '1rem 1.25rem', border: '1px solid var(--border)',
                        }}>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                                {stat.label}
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {stat.value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Filter Tabs */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    {['ALL', 'DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED'].map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            style={{
                                padding: '0.375rem 0.875rem', borderRadius: 'var(--radius-full)',
                                border: '1px solid var(--border)', cursor: 'pointer',
                                fontSize: 'var(--text-xs)', fontWeight: 500,
                                background: filterStatus === status ? 'var(--accent)' : 'var(--bg-surface)',
                                color: filterStatus === status ? '#fff' : 'var(--text-secondary)',
                                transition: 'all var(--duration-fast) var(--ease)',
                            }}
                        >
                            {status === 'ALL' ? 'All' : STATUS_CONFIG[status]?.label || status}
                        </button>
                    ))}
                </div>

                {/* Campaign List */}
                {isLoading ? (
                    <PageLoader isLoading={true}><div /></PageLoader>
                ) : filtered.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '4rem 2rem',
                        color: 'var(--text-secondary)', fontSize: 'var(--text-sm)',
                    }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', opacity: 0.5 }}>
                            <path d="m3 11 18-5v12L3 14v-3z" />
                            <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
                        </svg>
                        <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>No campaigns yet</p>
                        <p>Create your first campaign to start automated outreach.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {filtered.map(campaign => (
                            <div
                                key={campaign.id}
                                style={{
                                    background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border)', padding: '1rem 1.25rem',
                                    cursor: 'pointer', transition: 'all var(--duration-fast) var(--ease)',
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                }}
                                onClick={() => router.push(`/campaigns/${campaign.id}`)}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; }}
                            >
                                {/* Name + Goal */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                        <span style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
                                            {campaign.name}
                                        </span>
                                        <span className={`badge badge-sm ${GOAL_CONFIG[campaign.goal]?.color || 'badge-gray'}`}>
                                            {GOAL_CONFIG[campaign.goal]?.label || campaign.goal}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'flex', gap: '1rem' }}>
                                        <span>{campaign.sendingAccount?.email || 'No account'}</span>
                                        <span>{campaign.stepCount} step{campaign.stepCount !== 1 ? 's' : ''}</span>
                                        <span>{formatDate(campaign.createdAt)}</span>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexShrink: 0 }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Contacts</div>
                                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{campaign.contactCount}</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Sent</div>
                                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{campaign.sentCount}</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Open</div>
                                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: campaign.openRate > 30 ? 'var(--success)' : 'var(--text-primary)' }}>
                                            {campaign.openRate}%
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Reply</div>
                                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: campaign.replyRate > 10 ? 'var(--success)' : 'var(--text-primary)' }}>
                                            {campaign.replyRate}%
                                        </div>
                                    </div>
                                </div>

                                {/* Status Badge */}
                                <span className={`badge ${STATUS_CONFIG[campaign.status]?.color || 'badge-gray'}`}>
                                    {STATUS_CONFIG[campaign.status]?.label || campaign.status}
                                </span>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}
                                    onClick={e => e.stopPropagation()}
                                >
                                    {campaign.status === 'DRAFT' && (
                                        <button
                                            onClick={() => handleAction(campaign.id, 'launch')}
                                            disabled={actionLoading === campaign.id}
                                            className="btn-icon"
                                            title="Launch"
                                            style={{
                                                background: 'var(--success)', color: '#fff', border: 'none',
                                                borderRadius: 'var(--radius-xs)', padding: '0.375rem',
                                                cursor: 'pointer', opacity: actionLoading === campaign.id ? 0.5 : 1,
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                                <polygon points="5 3 19 12 5 21 5 3" />
                                            </svg>
                                        </button>
                                    )}
                                    {campaign.status === 'RUNNING' && (
                                        <button
                                            onClick={() => handleAction(campaign.id, 'pause')}
                                            disabled={actionLoading === campaign.id}
                                            className="btn-icon"
                                            title="Pause"
                                            style={{
                                                background: 'var(--warning)', color: '#fff', border: 'none',
                                                borderRadius: 'var(--radius-xs)', padding: '0.375rem',
                                                cursor: 'pointer', opacity: actionLoading === campaign.id ? 0.5 : 1,
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                                <rect x="6" y="4" width="4" height="16" />
                                                <rect x="14" y="4" width="4" height="16" />
                                            </svg>
                                        </button>
                                    )}
                                    {campaign.status === 'PAUSED' && (
                                        <button
                                            onClick={() => handleAction(campaign.id, 'resume')}
                                            disabled={actionLoading === campaign.id}
                                            className="btn-icon"
                                            title="Resume"
                                            style={{
                                                background: 'var(--accent)', color: '#fff', border: 'none',
                                                borderRadius: 'var(--radius-xs)', padding: '0.375rem',
                                                cursor: 'pointer', opacity: actionLoading === campaign.id ? 0.5 : 1,
                                            }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                                <polygon points="5 3 19 12 5 21 5 3" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
