'use client';

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHydrated } from '../../utils/useHydration';
import { PageLoader } from '../../components/LoadingStates';
import {
    getCampaignDetailAction,
    pauseCampaignAction,
    resumeCampaignAction,
    launchCampaignAction,
    deleteCampaignAction,
    removeContactFromCampaignAction,
    enrollContactsAction,
    getEnrollableContactsAction,
    getCampaignAnalyticsAction,
    getVariantAnalyticsAction,
    updateCampaignOptionsAction,
    diagnoseCampaignAction,
} from '../../../src/actions/campaignActions';
import { useUndoToast } from '../../context/UndoToastContext';
import ABTestingAnalytics from '../../components/ABTestingAnalytics';
import { CampaignOptionsTab, CampaignScheduleTab } from '../../components/CampaignTabs';

// Lazy-load Recharts
const LazyCharts = lazy(() => import('./CampaignCharts'));

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignDetail = {
    id: string;
    name: string;
    goal: string;
    status: string;
    daily_send_limit: number;
    track_replies: boolean;
    auto_stop_on_reply: boolean;
    scheduled_start_at: string | null;
    created_at: string;
    sending_account: { id: string; email: string } | null;
    created_by: { id: string; name: string } | null;
    steps: any[];
    contacts: any[];
    totalSent: number;
    totalOpened: number;
    totalReplied: number;
    openRate: number;
    replyRate: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    DRAFT: { label: 'Draft', color: '#6B7280', bg: '#f1f3f4' },
    SCHEDULED: { label: 'Scheduled', color: '#1a73e8', bg: '#e8f0fe' },
    RUNNING: { label: 'Running', color: '#137333', bg: '#e6f4ea' },
    PAUSED: { label: 'Paused', color: '#b06000', bg: '#fef7e0' },
    COMPLETED: { label: 'Completed', color: '#8430ce', bg: '#f3e8fd' },
    ARCHIVED: { label: 'Archived', color: '#c5221f', bg: '#fce8e6' },
};

const CONTACT_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
    PENDING: { label: 'Pending', badgeClass: 'badge-gray' },
    IN_PROGRESS: { label: 'In Progress', badgeClass: 'badge-blue' },
    COMPLETED: { label: 'Completed', badgeClass: 'badge-green' },
    STOPPED: { label: 'Stopped', badgeClass: 'badge-yellow' },
    BOUNCED: { label: 'Bounced', badgeClass: 'badge-red' },
    UNSUBSCRIBED: { label: 'Unsubscribed', badgeClass: 'badge-red' },
};

function formatDate(dateStr: string | null) {
    if (!dateStr) return '\u2014';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(dateStr: string | null) {
    if (!dateStr) return '\u2014';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '\u2014';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const { scheduleDelete } = useUndoToast();
    const isHydrated = useHydrated();

    const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'analytics' | 'ab_results' | 'options' | 'schedule'>('overview');
    const [actionLoading, setActionLoading] = useState(false);
    const [contactFilter, setContactFilter] = useState('ALL');
    const [analytics, setAnalytics] = useState<any>(null);
    const [variantAnalytics, setVariantAnalytics] = useState<any>(null);
    const [variantAnalyticsLoading, setVariantAnalyticsLoading] = useState(false);

    // Enrollment modal
    const [showEnrollModal, setShowEnrollModal] = useState(false);
    const [enrollableContacts, setEnrollableContacts] = useState<any[]>([]);
    const [enrollSelectedIds, setEnrollSelectedIds] = useState<Set<string>>(new Set());
    const [enrollSearch, setEnrollSearch] = useState('');
    const [isEnrolling, setIsEnrolling] = useState(false);

    useEffect(() => {
        if (id) loadCampaign();
    }, [id]);

    useEffect(() => {
        if (activeTab === 'analytics' && id && !analytics) {
            getCampaignAnalyticsAction(id as string).then(setAnalytics);
        }
        if (activeTab === 'ab_results' && id && !variantAnalytics) {
            setVariantAnalyticsLoading(true);
            getVariantAnalyticsAction(id as string)
                .then(setVariantAnalytics)
                .finally(() => setVariantAnalyticsLoading(false));
        }
    }, [activeTab, id]);

    async function loadCampaign() {
        setIsLoading(true);
        try {
            const data = await getCampaignDetailAction(id as string);
            setCampaign(data as CampaignDetail | null);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleAction(action: 'launch' | 'pause' | 'resume' | 'archive') {
        if (!campaign) return;
        setActionLoading(true);
        try {
            let result: any;
            switch (action) {
                case 'launch': result = await launchCampaignAction(campaign.id); break;
                case 'pause': result = await pauseCampaignAction(campaign.id); break;
                case 'resume': result = await resumeCampaignAction(campaign.id); break;
                case 'archive': {
                    const campData = { ...campaign };
                    scheduleDelete({
                        id: campaign.id,
                        type: 'campaign',
                        label: campaign.name || 'Campaign',
                        data: campData,
                        deleteAction: () => deleteCampaignAction(campaign.id),
                        onUndo: () => {},
                    });
                    router.push('/campaigns');
                    return;
                }
            }
            if (result?.success) await loadCampaign();
        } finally {
            setActionLoading(false);
        }
    }

    function handleRemoveContact(contactId: string) {
        if (!campaign) return;
        const contact = campaign.contacts?.find((c: any) => c.contactId === contactId || c.contact_id === contactId);
        const label = contact?.contactName || contact?.contact?.name || 'Contact';
        scheduleDelete({
            id: `campaign-contact-${contactId}`,
            type: 'contact',
            label,
            data: { campaignId: campaign.id, contactId },
            deleteAction: () => removeContactFromCampaignAction(campaign.id, contactId),
            onUndo: () => loadCampaign(),
        });
        // Optimistic: remove from UI
        setCampaign(prev => prev ? {
            ...prev,
            contacts: (prev.contacts || []).filter((c: any) => (c.contactId || c.contact_id) !== contactId),
        } : prev);
    }

    async function openEnrollModal() {
        setShowEnrollModal(true);
        const data = await getEnrollableContactsAction(campaign!.id);
        setEnrollableContacts(data);
    }

    async function handleEnroll() {
        if (!campaign || enrollSelectedIds.size === 0) return;
        setIsEnrolling(true);
        try {
            await enrollContactsAction(campaign.id, Array.from(enrollSelectedIds));
            setShowEnrollModal(false);
            setEnrollSelectedIds(new Set());
            await loadCampaign();
        } finally {
            setIsEnrolling(false);
        }
    }

    if (!isHydrated) return null;
    if (isLoading) return <div className="mailbox-wrapper"><PageLoader isLoading={true}><div /></PageLoader></div>;
    if (!campaign) return (
        <div className="mailbox-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p>Campaign not found</p>
                <button onClick={() => router.push('/campaigns')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Back to Campaigns
                </button>
            </div>
        </div>
    );

    const statusConfig = STATUS_CONFIG[campaign.status] || { label: 'Draft', color: '#6B7280', bg: '#f1f3f4' };
    const hasABVariants = campaign.steps.some((s: any) => s.variants && s.variants.length > 1);
    const filteredContacts = contactFilter === 'ALL'
        ? campaign.contacts
        : campaign.contacts.filter((c: any) => c.status === contactFilter);

    return (
        <div className="mailbox-wrapper" style={{ background: 'var(--bg-base)' }}>
            {/* Header */}
            <div style={{
                padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)',
                background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        onClick={() => router.push('/campaigns')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                    </button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                {campaign.name}
                            </h1>
                            <span style={{
                                fontSize: '10px', fontWeight: 600, padding: '0.125rem 0.5rem',
                                borderRadius: 'var(--radius-full)',
                                background: statusConfig.bg, color: statusConfig.color,
                            }}>
                                {statusConfig.label}
                            </span>
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                            {campaign.sending_account?.email} &middot; Created {formatShortDate(campaign.created_at)}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {campaign.status === 'DRAFT' && (
                        <>
                            <button
                                onClick={() => router.push(`/campaigns/new?clone=${campaign.id}`)}
                                style={{
                                    padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-full)',
                                    border: '1px solid var(--border)', background: 'var(--bg-surface)',
                                    cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 500,
                                    color: 'var(--text-primary)',
                                }}
                            >
                                Edit
                            </button>
                            <button
                                onClick={() => handleAction('launch')}
                                disabled={actionLoading}
                                style={{
                                    padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-full)',
                                    border: 'none', background: 'var(--success)', color: '#fff',
                                    cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 500,
                                    opacity: actionLoading ? 0.5 : 1,
                                }}
                            >
                                Launch
                            </button>
                        </>
                    )}
                    {campaign.status === 'RUNNING' && (
                        <button
                            onClick={() => handleAction('pause')}
                            disabled={actionLoading}
                            style={{
                                padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-full)',
                                border: 'none', background: 'var(--warning)', color: '#fff',
                                cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 500,
                                opacity: actionLoading ? 0.5 : 1,
                            }}
                        >
                            Pause
                        </button>
                    )}
                    {campaign.status === 'PAUSED' && (
                        <button
                            onClick={() => handleAction('resume')}
                            disabled={actionLoading}
                            style={{
                                padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-full)',
                                border: 'none', background: 'var(--accent)', color: '#fff',
                                cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 500,
                                opacity: actionLoading ? 0.5 : 1,
                            }}
                        >
                            Resume
                        </button>
                    )}
                    {campaign.status !== 'ARCHIVED' && (
                        <button
                            onClick={() => handleAction('archive')}
                            style={{
                                padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-full)',
                                border: '1px solid var(--border)', background: 'var(--bg-surface)',
                                cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                            }}
                        >
                            Archive
                        </button>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem',
                padding: '1rem 1.5rem', flexShrink: 0,
            }}>
                {[
                    { label: 'Sent', value: campaign.totalSent, color: 'var(--text-primary)' },
                    { label: 'Delivered', value: campaign.totalSent, color: 'var(--text-primary)' },
                    { label: 'Opened', value: `${campaign.openRate}%`, color: campaign.openRate > 30 ? 'var(--success)' : 'var(--text-primary)' },
                    { label: 'Replied', value: `${campaign.replyRate}%`, color: campaign.replyRate > 10 ? 'var(--success)' : 'var(--text-primary)' },
                ].map(kpi => (
                    <div key={kpi.label} style={{
                        background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                        padding: '1rem', border: '1px solid var(--border)', textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                            {kpi.label}
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: kpi.color }}>
                            {kpi.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex', borderBottom: '1px solid var(--border)',
                padding: '0 1.5rem', flexShrink: 0,
            }}>
                {([...(['overview', 'contacts', 'analytics', 'options', 'schedule'] as const), ...(hasABVariants ? ['ab_results' as const] : [])]).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '0.75rem 1rem', border: 'none', cursor: 'pointer',
                            fontSize: 'var(--text-sm)', fontWeight: 500, background: 'transparent',
                            color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                            borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                        }}
                    >
                        {tab === 'ab_results' ? 'A/B Results' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                        {tab === 'contacts' && (
                            <span style={{
                                marginLeft: '0.375rem', fontSize: '10px', background: 'var(--bg-elevated)',
                                padding: '0.125rem 0.375rem', borderRadius: 'var(--radius-full)',
                            }}>
                                {campaign.contacts.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                {/* ── Overview Tab ── */}
                {activeTab === 'overview' && (
                    <div style={{ maxWidth: '800px' }}>
                        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>
                            Sequence Performance
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {campaign.steps.map((step: any) => (
                                <div key={step.id} style={{
                                    background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border)', padding: '1rem',
                                    marginLeft: step.is_subsequence ? '2rem' : 0,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{
                                                fontWeight: 700, fontSize: 'var(--text-xs)',
                                                padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-full)',
                                                background: step.is_subsequence ? '#fef7e0' : 'var(--accent-light)',
                                                color: step.is_subsequence ? '#b06000' : 'var(--accent)',
                                            }}>
                                                Step {step.step_number}
                                            </span>
                                            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>
                                                {step.subject}
                                            </span>
                                        </div>
                                        {!step.is_subsequence && (
                                            <span className="badge badge-sm badge-gray">
                                                Day {step.delay_days}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '2rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                        <span>Sent: <strong>{step.stats?.sent || 0}</strong></span>
                                        <span>Opened: <strong>{step.stats?.opened || 0}</strong> ({step.stats?.sent > 0 ? Math.round((step.stats.opened / step.stats.sent) * 100) : 0}%)</span>
                                        <span>Replied: <strong>{step.stats?.replied || 0}</strong></span>
                                        {step.variants && step.variants.length > 0 && (
                                            <>
                                                <span style={{ color: 'var(--accent)' }}>
                                                    A: {step.stats?.variantASent || 0} sent, {step.stats?.variantAOpened || 0} opened
                                                </span>
                                                <span style={{ color: 'var(--success)' }}>
                                                    B: {step.stats?.variantBSent || 0} sent, {step.stats?.variantBOpened || 0} opened
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {campaign.steps.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                                No steps configured yet.
                            </div>
                        )}

                        {/* Diagnose Button */}
                        <button
                            onClick={async () => {
                                const result = await diagnoseCampaignAction(campaign.id);
                                const lines: string[] = [];
                                if (result.issues?.length) lines.push('ISSUES:\n' + result.issues.map((i: string) => '  - ' + i).join('\n'));
                                if (result.warnings?.length) lines.push('WARNINGS:\n' + result.warnings.map((w: string) => '  - ' + w).join('\n'));
                                if (result.stats) lines.push('STATS:\n' + Object.entries(result.stats).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
                                alert(lines.join('\n\n') || 'Everything looks good!');
                            }}
                            style={{
                                marginTop: '1.5rem', padding: '0.5rem 1rem', fontSize: 'var(--text-sm)',
                                background: 'transparent', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                                color: 'var(--accent)',
                            }}
                        >
                            Diagnose — why is this campaign not sending?
                        </button>
                    </div>
                )}

                {/* ── Contacts Tab ── */}
                {activeTab === 'contacts' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {['ALL', 'IN_PROGRESS', 'COMPLETED', 'STOPPED', 'BOUNCED'].map(status => (
                                    <button
                                        key={status}
                                        onClick={() => setContactFilter(status)}
                                        style={{
                                            padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)',
                                            border: '1px solid var(--border)', cursor: 'pointer',
                                            fontSize: '10px', fontWeight: 500,
                                            background: contactFilter === status ? 'var(--accent)' : 'var(--bg-surface)',
                                            color: contactFilter === status ? '#fff' : 'var(--text-secondary)',
                                        }}
                                    >
                                        {status === 'ALL' ? 'All' : CONTACT_STATUS_CONFIG[status]?.label || status}
                                    </button>
                                ))}
                            </div>
                            {(campaign.status === 'DRAFT' || campaign.status === 'RUNNING') && (
                                <button
                                    onClick={openEnrollModal}
                                    style={{
                                        padding: '0.375rem 0.875rem', borderRadius: 'var(--radius-full)',
                                        background: 'var(--accent)', color: '#fff', border: 'none',
                                        cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 500,
                                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                                    }}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 5v14m-7-7h14" />
                                    </svg>
                                    Add Contacts
                                </button>
                            )}
                            {/* CSV Import */}
                            <label style={{
                                padding: '0.375rem 0.875rem', borderRadius: 'var(--radius-full)',
                                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                                cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 500,
                                display: 'flex', alignItems: 'center', gap: '0.375rem',
                                color: 'var(--text-secondary)',
                            }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                                Import CSV
                                <input type="file" accept=".csv" style={{ display: 'none' }} onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const text = await file.text();
                                    const { importLeadsFromCSVAction } = await import('../../../src/actions/campaignActions');
                                    const result = await importLeadsFromCSVAction(campaign.id, text);
                                    if (result.success) {
                                        alert(`Imported: ${result.imported}, Skipped: ${result.skipped}${result.errors?.length ? '\nErrors:\n' + result.errors.join('\n') : ''}`);
                                        window.location.reload();
                                    } else {
                                        alert(result.error || 'Import failed');
                                    }
                                    e.target.value = '';
                                }} />
                            </label>
                        </div>

                        {filteredContacts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                                No contacts in this category.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {filteredContacts.map((cc: any) => (
                                    <div key={cc.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '1rem',
                                        padding: '0.75rem 1rem', background: 'var(--bg-surface)',
                                        borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)',
                                    }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                                                {cc.contact?.name || cc.contact?.email || 'Unknown'}
                                            </div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                                {cc.contact?.email}
                                                {cc.contact?.company && ` - ${cc.contact.company}`}
                                            </div>
                                        </div>
                                        <span className={`badge badge-sm ${CONTACT_STATUS_CONFIG[cc.status]?.badgeClass || 'badge-gray'}`}>
                                            {CONTACT_STATUS_CONFIG[cc.status]?.label || cc.status}
                                        </span>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textAlign: 'center', minWidth: '60px' }}>
                                            Step {cc.current_step_number}
                                        </div>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', minWidth: '80px' }}>
                                            {cc.last_step_sent_at ? formatShortDate(cc.last_step_sent_at) : 'Not sent'}
                                        </div>
                                        {cc.stopped_reason && (
                                            <span className="badge badge-sm badge-yellow">
                                                {cc.stopped_reason}
                                            </span>
                                        )}
                                        {cc.status !== 'STOPPED' && cc.status !== 'COMPLETED' && cc.status !== 'BOUNCED' && (
                                            <button
                                                onClick={() => handleRemoveContact(cc.contact_id)}
                                                title="Remove from campaign"
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: 'var(--text-tertiary)', padding: '0.25rem',
                                                }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Analytics Tab ── */}
                {activeTab === 'analytics' && (
                    <div>
                        {!analytics ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                                Loading analytics...
                            </div>
                        ) : (
                            <Suspense fallback={<div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading charts...</div>}>
                                <LazyCharts analytics={analytics} />
                            </Suspense>
                        )}
                    </div>
                )}
                {/* ── A/B Results Tab ── */}
                {activeTab === 'ab_results' && (
                    <div style={{ maxWidth: '800px' }}>
                        <ABTestingAnalytics data={variantAnalytics || []} isLoading={variantAnalyticsLoading} />
                    </div>
                )}

                {/* ── Options Tab ── */}
                {activeTab === 'options' && campaign && (
                    <CampaignOptionsTab campaign={campaign} onSave={async (updates) => {
                        const res = await updateCampaignOptionsAction(campaign.id, updates);
                        if (res.success) setCampaign({ ...campaign, ...updates });
                    }} />
                )}

                {/* ── Schedule Tab ── */}
                {activeTab === 'schedule' && campaign && (
                    <CampaignScheduleTab campaign={campaign} onSave={async (updates) => {
                        const res = await updateCampaignOptionsAction(campaign.id, updates);
                        if (res.success) setCampaign({ ...campaign, ...updates });
                    }} />
                )}
            </div>

            {/* Enrollment Modal */}
            {showEnrollModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }}
                    onClick={() => setShowEnrollModal(false)}
                >
                    <div
                        style={{
                            background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                            width: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>Add Contacts</h3>
                            <button onClick={() => setShowEnrollModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div style={{ padding: '0.75rem 1.25rem' }}>
                            <input
                                type="text"
                                value={enrollSearch}
                                onChange={e => setEnrollSearch(e.target.value)}
                                placeholder="Search contacts..."
                                style={{
                                    width: '100%', padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-full)',
                                    border: '1px solid var(--border)', fontSize: 'var(--text-sm)',
                                    background: 'var(--bg-surface)', outline: 'none',
                                }}
                            />
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: '0 1.25rem' }}>
                            {enrollableContacts
                                .filter(c => {
                                    if (!enrollSearch) return true;
                                    const q = enrollSearch.toLowerCase();
                                    return c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
                                })
                                .filter(c => !c.isEnrolled)
                                .map((c: any) => (
                                    <label key={c.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                                        padding: '0.625rem 0', borderBottom: '1px solid var(--border)',
                                        cursor: 'pointer',
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={enrollSelectedIds.has(c.id)}
                                            onChange={() => {
                                                setEnrollSelectedIds(prev => {
                                                    const next = new Set(prev);
                                                    next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                                                    return next;
                                                });
                                            }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{c.name || c.email}</div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{c.email}</div>
                                        </div>
                                        {c.inOtherActiveCampaign && (
                                            <span className="badge badge-sm badge-yellow">In Campaign</span>
                                        )}
                                    </label>
                                ))}
                        </div>
                        <div style={{
                            padding: '0.875rem 1.25rem', borderTop: '1px solid var(--border)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                {enrollSelectedIds.size} selected
                            </span>
                            <button
                                onClick={handleEnroll}
                                disabled={isEnrolling || enrollSelectedIds.size === 0}
                                style={{
                                    padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)',
                                    background: 'var(--accent)', color: '#fff', border: 'none',
                                    cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 500,
                                    opacity: isEnrolling || enrollSelectedIds.size === 0 ? 0.5 : 1,
                                }}
                            >
                                {isEnrolling ? 'Enrolling...' : 'Enroll Contacts'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
