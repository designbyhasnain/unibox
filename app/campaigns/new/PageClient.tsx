'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { useHydrated } from '../../utils/useHydration';
import { getAccountsAction } from '../../../src/actions/accountActions';
import {
    createCampaignAction,
    enrollContactsAction,
    getEnrollableContactsAction,
    type CampaignStepInput,
} from '../../../src/actions/campaignActions';
import { createTemplateAction } from '../../../src/actions/templateActions';
import TemplatePickerModal from '../../components/TemplatePickerModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type Account = { id: string; email: string; status: string };

type VariantInput = {
    variantLabel: string;
    subject: string;
    body: string;
    weight: number;
};

type StepUI = {
    stepNumber: number;
    delayDays: number;
    subject: string;
    body: string;
    isSubsequence: boolean;
    subsequenceTrigger: string | null;
    parentStepNumber: number | null;
    hasABTest: boolean;
    variants: VariantInput[];
};

type EnrollableContact = {
    id: string;
    name: string | null;
    email: string;
    company: string | null;
    pipeline_stage: string | null;
    priority: string | null;
    location: string | null;
    isEnrolled: boolean;
    inOtherActiveCampaign: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const GOAL_OPTIONS = [
    { value: 'COLD_OUTREACH', label: 'Cold Outreach', desc: 'Reach new prospects who haven\'t heard from you', icon: '🎯' },
    { value: 'FOLLOW_UP', label: 'Follow Up', desc: 'Re-engage prospects who didn\'t reply', icon: '🔄' },
    { value: 'RETARGETING', label: 'Retargeting', desc: 'Win back past leads or clients', icon: '🎪' },
    { value: 'WARM_UP', label: 'Warm-up', desc: 'Nurture leads over time with value-driven content', icon: '🔥' },
    { value: 'CLOSED_WON', label: 'Closed-Won', desc: 'Upsell and cross-sell to past paying clients', icon: '🏆' },
    { value: 'LOCATION_BASED', label: 'Location-Based', desc: 'Target prospects by region or city', icon: '📍' },
    { value: 'SEASONAL', label: 'Seasonal', desc: 'Holiday and event-based promotions', icon: '🎄' },
];

const PLACEHOLDERS = [
    { label: 'First Name', value: '{{first_name}}' },
    { label: 'Last Name', value: '{{last_name}}' },
    { label: 'Full Name', value: '{{full_name}}' },
    { label: 'Company', value: '{{company}}' },
    { label: 'Email', value: '{{email}}' },
    { label: 'Phone', value: '{{phone}}' },
    { label: 'Unsubscribe Link', value: '{{unsubscribe_link}}' },
    { label: 'Spintax: Hi/Hello/Hey', value: '{Hi|Hello|Hey}' },
];

const STAGE_COLORS: Record<string, string> = {
    COLD_LEAD: 'badge-blue',
    LEAD: 'badge-green',
    OFFER_ACCEPTED: 'badge-purple',
    CLOSED: 'badge-gray',
    NOT_INTERESTED: 'badge-red',
};

function createEmptyStep(stepNumber: number): StepUI {
    return {
        stepNumber,
        delayDays: stepNumber === 1 ? 0 : 3,
        subject: '',
        body: '',
        isSubsequence: false,
        subsequenceTrigger: null,
        parentStepNumber: null,
        hasABTest: false,
        variants: [],
    };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CampaignBuilderPage() {
    const isHydrated = useHydrated();
    const router = useRouter();

    // Step 1: Setup
    const [name, setName] = useState('');
    const [goal, setGoal] = useState('COLD_OUTREACH');
    const [accountId, setAccountId] = useState('');
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [dailySendLimit, setDailySendLimit] = useState(50);
    const [autoStopOnReply, setAutoStopOnReply] = useState(true);
    const [scheduledStartAt, setScheduledStartAt] = useState('');
    const [scheduleMode, setScheduleMode] = useState<'now' | 'schedule'>('now');

    // Step 2: Sequence
    const [steps, setSteps] = useState<StepUI[]>([createEmptyStep(1)]);

    // Step 3: Recipients
    const [contacts, setContacts] = useState<EnrollableContact[]>([]);
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
    const [contactSearch, setContactSearch] = useState('');
    const [contactFilter, setContactFilter] = useState<string>('ALL');
    const [locationFilter, setLocationFilter] = useState<string>('ALL');
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);

    // UI State
    const [currentPanel, setCurrentPanel] = useState<'setup' | 'sequence' | 'recipients'>('setup');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        getAccountsAction().then((result: any) => {
            const accs = result?.accounts || [];
            const active = accs.filter((a: any) => a.status === 'ACTIVE');
            setAccounts(active);
            if (active.length > 0 && !accountId) setAccountId(active[0].id);
        });
    }, []);

    // ─── Step Management ─────────────────────────────────────────────────────

    function addStep() {
        const newNum = steps.length + 1;
        setSteps([...steps, createEmptyStep(newNum)]);
    }

    function addSubsequence(parentStepNumber: number) {
        const newNum = steps.length + 1;
        setSteps([...steps, {
            ...createEmptyStep(newNum),
            isSubsequence: true,
            subsequenceTrigger: 'OPENED_NO_REPLY',
            parentStepNumber,
            delayDays: 2,
        }]);
    }

    function updateStep(index: number, updates: Partial<StepUI>) {
        setSteps(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
    }

    function removeStep(index: number) {
        if (steps.length <= 1) return;
        const updated = steps.filter((_, i) => i !== index)
            .map((s, i) => ({ ...s, stepNumber: i + 1 }));
        setSteps(updated);
    }

    function toggleABTest(index: number) {
        const step = steps[index];
        if (!step) return;
        if (step.hasABTest) {
            updateStep(index, { hasABTest: false, variants: [] });
        } else {
            updateStep(index, {
                hasABTest: true,
                variants: [
                    { variantLabel: 'A', subject: step.subject, body: step.body, weight: 50 },
                    { variantLabel: 'B', subject: '', body: '', weight: 50 },
                ],
            });
        }
    }

    function updateVariant(stepIndex: number, variantIndex: number, updates: Partial<VariantInput>) {
        setSteps(prev => prev.map((s, si) => {
            if (si !== stepIndex) return s;
            const newVariants = s.variants.map((v, vi) => vi === variantIndex ? { ...v, ...updates } : v);
            return { ...s, variants: newVariants };
        }));
    }

    // ─── Contact Management ──────────────────────────────────────────────────

    const loadContactsTimeoutRef = useRef<NodeJS.Timeout>(undefined);

    const loadContacts = useCallback(async (search?: string) => {
        setIsLoadingContacts(true);
        try {
            // Pass a temporary placeholder ID since campaign not created yet
            const data = await getEnrollableContactsAction('__new__', search);
            setContacts(data as EnrollableContact[]);
        } finally {
            setIsLoadingContacts(false);
        }
    }, []);

    useEffect(() => {
        if (currentPanel === 'recipients' && contacts.length === 0) {
            loadContacts();
        }
    }, [currentPanel]);

    function handleContactSearch(value: string) {
        setContactSearch(value);
        clearTimeout(loadContactsTimeoutRef.current);
        loadContactsTimeoutRef.current = setTimeout(() => loadContacts(value), 300);
    }

    function toggleContact(contactId: string) {
        setSelectedContactIds(prev => {
            const next = new Set(prev);
            if (next.has(contactId)) next.delete(contactId);
            else next.add(contactId);
            return next;
        });
    }

    function selectAllFiltered() {
        const filteredIds = filteredContacts.map(c => c.id);
        setSelectedContactIds(prev => {
            const next = new Set(prev);
            const allSelected = filteredIds.every(id => next.has(id));
            if (allSelected) {
                filteredIds.forEach(id => next.delete(id));
            } else {
                filteredIds.forEach(id => next.add(id));
            }
            return next;
        });
    }

    // Extract unique locations for the location filter dropdown
    const uniqueLocations = [...new Set(contacts.map(c => c.location).filter(Boolean) as string[])].sort();

    const filteredContacts = contacts.filter(c => {
        if (contactFilter !== 'ALL' && c.pipeline_stage !== contactFilter) return false;
        if (locationFilter !== 'ALL' && (!c.location || !c.location.toLowerCase().includes(locationFilter.toLowerCase()))) return false;
        return true;
    });

    // ─── Insert Placeholder ──────────────────────────────────────────────────

    function insertPlaceholder(stepIndex: number, field: 'subject' | 'body', placeholder: string, variantIndex?: number) {
        const step = steps[stepIndex];
        if (!step) return;
        if (variantIndex !== undefined) {
            const variant = step.variants[variantIndex];
            if (!variant) return;
            updateVariant(stepIndex, variantIndex, { [field]: variant[field] + placeholder });
        } else {
            updateStep(stepIndex, { [field]: step[field] + placeholder });
        }
    }

    // ─── Save ────────────────────────────────────────────────────────────────

    async function handleSave(launch: boolean) {
        setError('');

        if (!name.trim()) { setError('Campaign name is required'); return; }
        if (!accountId) { setError('Please select a sending account'); return; }
        if (steps.some(s => !s.subject.trim() || !s.body.trim())) {
            setError('All steps must have a subject and body');
            return;
        }

        setIsSaving(true);
        try {
            const campaignSteps: CampaignStepInput[] = steps.map(s => ({
                stepNumber: s.stepNumber,
                delayDays: s.delayDays,
                subject: s.subject,
                body: DOMPurify.sanitize(s.body),
                isSubsequence: s.isSubsequence,
                subsequenceTrigger: s.subsequenceTrigger,
                parentStepNumber: s.parentStepNumber,
                variants: s.hasABTest ? s.variants.map(v => ({
                    variantLabel: v.variantLabel,
                    subject: v.subject,
                    body: DOMPurify.sanitize(v.body),
                    weight: v.weight,
                })) : undefined,
            }));

            const result = await createCampaignAction({
                name: name.trim(),
                goal,
                sendingGmailAccountId: accountId,
                dailySendLimit,
                autoStopOnReply,
                scheduledStartAt: scheduleMode === 'schedule' && scheduledStartAt ? scheduledStartAt : null,
                steps: campaignSteps,
            });

            if (!result.success) {
                setError(result.error || 'Failed to create campaign');
                return;
            }

            // Enroll selected contacts
            if (selectedContactIds.size > 0 && result.campaignId) {
                await enrollContactsAction(result.campaignId, Array.from(selectedContactIds));
            }

            // Launch if requested
            if (launch && result.campaignId) {
                const launchResult = await (await import('../../../src/actions/campaignActions')).launchCampaignAction(result.campaignId);
                if (!launchResult.success) {
                    setError(launchResult.error || 'Campaign created but failed to launch');
                    router.push(`/campaigns/${result.campaignId}`);
                    return;
                }
            }

            router.push(result.campaignId ? `/campaigns/${result.campaignId}` : '/campaigns');
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setIsSaving(false);
        }
    }

    if (!isHydrated) return null;

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
            {/* Top Navigation */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.875rem 1.5rem', borderBottom: '1px solid var(--border)',
                background: 'var(--bg-surface)', flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={() => router.push('/campaigns')}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                    </button>
                    <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        New Campaign
                    </h1>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => handleSave(false)}
                        disabled={isSaving}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)',
                            border: '1px solid var(--border)', background: 'var(--bg-surface)',
                            cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 500,
                            color: 'var(--text-primary)', opacity: isSaving ? 0.5 : 1,
                        }}
                    >
                        Save as Draft
                    </button>
                    <button
                        onClick={() => handleSave(true)}
                        disabled={isSaving}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)',
                            border: 'none', background: 'var(--accent)', color: '#fff',
                            cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 500,
                            opacity: isSaving ? 0.5 : 1,
                        }}
                    >
                        {isSaving ? 'Saving...' : 'Save & Launch'}
                    </button>
                </div>
            </div>

            {error && (
                <div style={{
                    background: 'var(--danger-soft)', color: 'var(--danger)', padding: '0.75rem 1.5rem',
                    fontSize: 'var(--text-sm)', borderBottom: '1px solid #f5c6cb',
                }}>
                    {error}
                </div>
            )}

            {/* Panel Tabs */}
            <div style={{
                display: 'flex', gap: '0', borderBottom: '1px solid var(--border)',
                background: 'var(--bg-surface)', flexShrink: 0,
            }}>
                {(['setup', 'sequence', 'recipients'] as const).map((panel, i) => (
                    <button
                        key={panel}
                        onClick={() => setCurrentPanel(panel)}
                        style={{
                            padding: '0.75rem 1.5rem', border: 'none', cursor: 'pointer',
                            fontSize: 'var(--text-sm)', fontWeight: 500,
                            background: currentPanel === panel ? 'var(--bg-surface)' : 'transparent',
                            color: currentPanel === panel ? 'var(--accent)' : 'var(--text-secondary)',
                            borderBottom: currentPanel === panel ? '2px solid var(--accent)' : '2px solid transparent',
                            transition: 'all var(--duration-fast) var(--ease)',
                        }}
                    >
                        {i + 1}. {panel.charAt(0).toUpperCase() + panel.slice(1)}
                    </button>
                ))}
            </div>

            {/* Panel Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                {/* ── Setup Panel ── */}
                {currentPanel === 'setup' && (
                    <div style={{ maxWidth: '640px' }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
                                Campaign Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g., Q1 Video Production Outreach"
                                style={{
                                    width: '100%', padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-xs)',
                                    border: '1px solid var(--border)', fontSize: 'var(--text-sm)',
                                    background: 'var(--bg-surface)', color: 'var(--text-primary)',
                                    outline: 'none',
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
                                Goal
                            </label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {GOAL_OPTIONS.map(opt => (
                                    <label
                                        key={opt.value}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '0.875rem', borderRadius: 'var(--radius-sm)',
                                            border: `1.5px solid ${goal === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                                            background: goal === opt.value ? 'var(--accent-light)' : 'var(--bg-surface)',
                                            cursor: 'pointer', transition: 'all var(--duration-fast) var(--ease)',
                                        }}
                                    >
                                        <input
                                            type="radio"
                                            name="goal"
                                            value={opt.value}
                                            checked={goal === opt.value}
                                            onChange={() => setGoal(opt.value)}
                                            style={{ display: 'none' }}
                                        />
                                        <span style={{ fontSize: '1.25rem' }}>{opt.icon}</span>
                                        <div>
                                            <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{opt.label}</div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{opt.desc}</div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
                                Sending Account
                            </label>
                            <select
                                value={accountId}
                                onChange={e => setAccountId(e.target.value)}
                                style={{
                                    width: '100%', padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-xs)',
                                    border: '1px solid var(--border)', fontSize: 'var(--text-sm)',
                                    background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer',
                                }}
                            >
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.email}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
                                Daily Send Limit: {dailySendLimit}
                            </label>
                            <input
                                type="range"
                                min={10}
                                max={200}
                                step={10}
                                value={dailySendLimit}
                                onChange={e => setDailySendLimit(Number(e.target.value))}
                                style={{ width: '100%', cursor: 'pointer' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                <span>10</span><span>200</span>
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
                                <input
                                    type="checkbox"
                                    checked={autoStopOnReply}
                                    onChange={e => setAutoStopOnReply(e.target.checked)}
                                    style={{ cursor: 'pointer' }}
                                />
                                <span style={{ color: 'var(--text-primary)' }}>Auto-stop on reply</span>
                            </label>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginLeft: '1.5rem', marginTop: '0.25rem' }}>
                                Stop sending to a contact once they reply to any email in the sequence
                            </div>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: '0.375rem', color: 'var(--text-primary)' }}>
                                Schedule
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setScheduleMode('now')}
                                    style={{
                                        padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)',
                                        border: '1px solid var(--border)', cursor: 'pointer',
                                        fontSize: 'var(--text-xs)', fontWeight: 500,
                                        background: scheduleMode === 'now' ? 'var(--accent)' : 'var(--bg-surface)',
                                        color: scheduleMode === 'now' ? '#fff' : 'var(--text-secondary)',
                                    }}
                                >
                                    Start Immediately
                                </button>
                                <button
                                    onClick={() => setScheduleMode('schedule')}
                                    style={{
                                        padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)',
                                        border: '1px solid var(--border)', cursor: 'pointer',
                                        fontSize: 'var(--text-xs)', fontWeight: 500,
                                        background: scheduleMode === 'schedule' ? 'var(--accent)' : 'var(--bg-surface)',
                                        color: scheduleMode === 'schedule' ? '#fff' : 'var(--text-secondary)',
                                    }}
                                >
                                    Schedule for Later
                                </button>
                            </div>
                            {scheduleMode === 'schedule' && (
                                <input
                                    type="datetime-local"
                                    value={scheduledStartAt}
                                    onChange={e => setScheduledStartAt(e.target.value)}
                                    style={{
                                        marginTop: '0.5rem', padding: '0.5rem 0.75rem',
                                        borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)',
                                        fontSize: 'var(--text-sm)', background: 'var(--bg-surface)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                            )}
                        </div>

                        <button
                            onClick={() => setCurrentPanel('sequence')}
                            style={{
                                padding: '0.625rem 1.25rem', borderRadius: 'var(--radius-full)',
                                background: 'var(--accent)', color: '#fff', border: 'none',
                                cursor: 'pointer', fontWeight: 500, fontSize: 'var(--text-sm)',
                            }}
                        >
                            Next: Build Sequence
                        </button>
                    </div>
                )}

                {/* ── Sequence Panel ── */}
                {currentPanel === 'sequence' && (
                    <div style={{ maxWidth: '720px' }}>
                        {steps.map((step, index) => (
                            <div key={index}>
                                {/* Delay connector */}
                                {index > 0 && !step.isSubsequence && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        padding: '0.75rem 0', paddingLeft: '1.5rem',
                                    }}>
                                        <div style={{
                                            width: '2px', height: '24px', background: 'var(--border)',
                                        }} />
                                        <span className="badge badge-sm badge-blue">
                                            Wait {step.delayDays} day{step.delayDays !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                )}

                                {/* Subsequence indicator */}
                                {step.isSubsequence && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                                        padding: '0.75rem 0', paddingLeft: '2.5rem',
                                    }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M6 3v12" /><path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                                            <path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                                            <path d="M15 6a9 9 0 0 0-9 9" />
                                        </svg>
                                        <span className="badge badge-sm badge-yellow">
                                            If opened but no reply after {step.delayDays} days
                                        </span>
                                    </div>
                                )}

                                {/* Step Card */}
                                <div style={{
                                    background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                                    border: '1px solid var(--border)', padding: '1.25rem',
                                    marginBottom: '0.5rem',
                                    marginLeft: step.isSubsequence ? '2rem' : 0,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{
                                                background: step.isSubsequence ? 'var(--warning-light, var(--warn-soft))' : 'var(--accent-light)',
                                                color: step.isSubsequence ? 'var(--warning)' : 'var(--accent)',
                                                fontWeight: 700, fontSize: 'var(--text-xs)',
                                                padding: '0.25rem 0.625rem', borderRadius: 'var(--radius-full)',
                                            }}>
                                                Step {step.stepNumber}
                                            </span>
                                            {!step.isSubsequence && index > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Delay:</label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={30}
                                                        value={step.delayDays}
                                                        onChange={e => updateStep(index, { delayDays: parseInt(e.target.value) || 1 })}
                                                        style={{
                                                            width: '50px', padding: '0.25rem 0.375rem',
                                                            borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)',
                                                            fontSize: 'var(--text-xs)', textAlign: 'center',
                                                            background: 'var(--bg-surface)', color: 'var(--text-primary)',
                                                        }}
                                                    />
                                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>days</span>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                                            {!step.isSubsequence && (
                                                <button
                                                    onClick={() => toggleABTest(index)}
                                                    style={{
                                                        padding: '0.25rem 0.625rem', borderRadius: 'var(--radius-full)',
                                                        border: '1px solid var(--border)', cursor: 'pointer',
                                                        fontSize: '10px', fontWeight: 600,
                                                        background: step.hasABTest ? 'var(--accent-light)' : 'transparent',
                                                        color: step.hasABTest ? 'var(--accent)' : 'var(--text-secondary)',
                                                    }}
                                                >
                                                    A/B
                                                </button>
                                            )}
                                            {steps.length > 1 && (
                                                <button
                                                    onClick={() => removeStep(index)}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'var(--text-tertiary)', padding: '0.25rem',
                                                    }}
                                                    title="Remove step"
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Main content or A/B variants */}
                                    {!step.hasABTest ? (
                                        <StepEditor
                                            subject={step.subject}
                                            body={step.body}
                                            onSubjectChange={v => updateStep(index, { subject: v })}
                                            onBodyChange={v => updateStep(index, { body: v })}
                                            onInsertPlaceholder={(field, ph) => insertPlaceholder(index, field, ph)}
                                            campaignGoal={goal}
                                        />
                                    ) : (
                                        <div>
                                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                                    Weight: A ({step.variants[0]?.weight}%) / B ({step.variants[1]?.weight}%)
                                                </div>
                                                <input
                                                    type="range"
                                                    min={10} max={90}
                                                    value={step.variants[0]?.weight || 50}
                                                    onChange={e => {
                                                        const w = parseInt(e.target.value);
                                                        updateVariant(index, 0, { weight: w });
                                                        updateVariant(index, 1, { weight: 100 - w });
                                                    }}
                                                    style={{ flex: 1, cursor: 'pointer' }}
                                                />
                                            </div>
                                            {step.variants.map((variant, vi) => (
                                                <div key={vi} style={{
                                                    border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                                                    padding: '0.875rem', marginBottom: vi === 0 ? '0.5rem' : 0,
                                                }}>
                                                    <div style={{
                                                        fontSize: 'var(--text-xs)', fontWeight: 600,
                                                        color: vi === 0 ? 'var(--accent)' : 'var(--success)',
                                                        marginBottom: '0.5rem',
                                                    }}>
                                                        Variant {variant.variantLabel}
                                                    </div>
                                                    <StepEditor
                                                        subject={variant.subject}
                                                        body={variant.body}
                                                        onSubjectChange={v => updateVariant(index, vi, { subject: v })}
                                                        onBodyChange={v => updateVariant(index, vi, { body: v })}
                                                        onInsertPlaceholder={(field, ph) => insertPlaceholder(index, field, ph, vi)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add Subsequence button */}
                                    {!step.isSubsequence && (
                                        <button
                                            onClick={() => addSubsequence(step.stepNumber)}
                                            style={{
                                                marginTop: '0.75rem', padding: '0.375rem 0.75rem',
                                                border: '1px dashed var(--border)', borderRadius: 'var(--radius-xs)',
                                                background: 'transparent', cursor: 'pointer',
                                                fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                                                display: 'flex', alignItems: 'center', gap: '0.375rem',
                                            }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 5v14m-7-7h14" />
                                            </svg>
                                            Add Subsequence (if opened, no reply)
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Add Step Button */}
                        <button
                            onClick={addStep}
                            style={{
                                width: '100%', padding: '0.875rem', marginTop: '0.5rem',
                                border: '2px dashed var(--border)', borderRadius: 'var(--radius-sm)',
                                background: 'transparent', cursor: 'pointer',
                                fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-secondary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                transition: 'all var(--duration-fast) var(--ease)',
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 5v14m-7-7h14" />
                            </svg>
                            Add Step
                        </button>

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                            <button
                                onClick={() => setCurrentPanel('setup')}
                                style={{
                                    padding: '0.625rem 1.25rem', borderRadius: 'var(--radius-full)',
                                    border: '1px solid var(--border)', background: 'var(--bg-surface)',
                                    cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
                                }}
                            >
                                Back
                            </button>
                            <button
                                onClick={() => setCurrentPanel('recipients')}
                                style={{
                                    padding: '0.625rem 1.25rem', borderRadius: 'var(--radius-full)',
                                    background: 'var(--accent)', color: '#fff', border: 'none',
                                    cursor: 'pointer', fontWeight: 500, fontSize: 'var(--text-sm)',
                                }}
                            >
                                Next: Select Recipients
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Recipients Panel ── */}
                {currentPanel === 'recipients' && (
                    <div style={{ maxWidth: '720px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                    Select Recipients
                                </h2>
                                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
                                    {selectedContactIds.size} contact{selectedContactIds.size !== 1 ? 's' : ''} selected
                                </p>
                            </div>
                            <button
                                onClick={selectAllFiltered}
                                style={{
                                    padding: '0.375rem 0.75rem', borderRadius: 'var(--radius-full)',
                                    border: '1px solid var(--border)', background: 'var(--bg-surface)',
                                    cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                                }}
                            >
                                {filteredContacts.every(c => selectedContactIds.has(c.id)) ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>

                        {/* Search & Filter */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <input
                                type="text"
                                value={contactSearch}
                                onChange={e => handleContactSearch(e.target.value)}
                                placeholder="Search contacts..."
                                style={{
                                    flex: 1, padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-full)',
                                    border: '1px solid var(--border)', fontSize: 'var(--text-sm)',
                                    background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none',
                                }}
                            />
                            <select
                                value={contactFilter}
                                onChange={e => setContactFilter(e.target.value)}
                                style={{
                                    padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-full)',
                                    border: '1px solid var(--border)', fontSize: 'var(--text-xs)',
                                    background: 'var(--bg-surface)', cursor: 'pointer',
                                }}
                            >
                                <option value="ALL">All Stages</option>
                                <option value="COLD_LEAD">Cold Lead</option>
                                <option value="CONTACTED">Contacted</option>
                                <option value="LEAD">Lead</option>
                                <option value="OFFER_ACCEPTED">Offer Accepted</option>
                                <option value="CLOSED">Closed</option>
                            </select>
                            <select
                                value={locationFilter}
                                onChange={e => setLocationFilter(e.target.value)}
                                style={{
                                    padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-full)',
                                    border: '1px solid var(--border)', fontSize: 'var(--text-xs)',
                                    background: 'var(--bg-surface)', cursor: 'pointer',
                                }}
                            >
                                <option value="ALL">All Locations</option>
                                {uniqueLocations.map(loc => (
                                    <option key={loc} value={loc}>{loc}</option>
                                ))}
                            </select>
                        </div>

                        {/* Contact List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {isLoadingContacts ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                                    Loading contacts...
                                </div>
                            ) : filteredContacts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                                    No contacts found
                                </div>
                            ) : filteredContacts.map(contact => (
                                <label
                                    key={contact.id}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                                        padding: '0.75rem', borderRadius: 'var(--radius-xs)',
                                        border: `1px solid ${selectedContactIds.has(contact.id) ? 'var(--accent)' : 'var(--border)'}`,
                                        background: selectedContactIds.has(contact.id) ? 'var(--accent-light)' : 'var(--bg-surface)',
                                        cursor: 'pointer', transition: 'all var(--duration-fast) var(--ease)',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedContactIds.has(contact.id)}
                                        onChange={() => toggleContact(contact.id)}
                                        style={{ cursor: 'pointer', flexShrink: 0 }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                                            {contact.name || contact.email}
                                        </div>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                            {contact.email}
                                            {contact.company && ` - ${contact.company}`}
                                        </div>
                                    </div>
                                    {contact.pipeline_stage && (
                                        <span className={`badge badge-sm ${STAGE_COLORS[contact.pipeline_stage] || 'badge-gray'}`}>
                                            {contact.pipeline_stage.replace(/_/g, ' ')}
                                        </span>
                                    )}
                                    {contact.inOtherActiveCampaign && (
                                        <span className="badge badge-sm badge-yellow" title="Already in another active campaign">
                                            In Campaign
                                        </span>
                                    )}
                                </label>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                            <button
                                onClick={() => setCurrentPanel('sequence')}
                                style={{
                                    padding: '0.625rem 1.25rem', borderRadius: 'var(--radius-full)',
                                    border: '1px solid var(--border)', background: 'var(--bg-surface)',
                                    cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
                                }}
                            >
                                Back
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom bar with count */}
            <div style={{
                padding: '0.75rem 1.5rem', borderTop: '1px solid var(--border)',
                background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', flexShrink: 0,
            }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {steps.length} step{steps.length !== 1 ? 's' : ''} &middot; {selectedContactIds.size} recipient{selectedContactIds.size !== 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => handleSave(false)}
                        disabled={isSaving}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)',
                            border: '1px solid var(--border)', background: 'var(--bg-surface)',
                            cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 500,
                            color: 'var(--text-primary)', opacity: isSaving ? 0.5 : 1,
                        }}
                    >
                        Save Draft
                    </button>
                    <button
                        onClick={() => handleSave(true)}
                        disabled={isSaving}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)',
                            border: 'none', background: 'var(--accent)', color: '#fff',
                            cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 500,
                            opacity: isSaving ? 0.5 : 1,
                        }}
                    >
                        {isSaving ? 'Saving...' : 'Save & Launch'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Step Editor Sub-Component ───────────────────────────────────────────────

function StepEditor({
    subject, body, onSubjectChange, onBodyChange, onInsertPlaceholder, campaignGoal,
}: {
    subject: string;
    body: string;
    onSubjectChange: (v: string) => void;
    onBodyChange: (v: string) => void;
    onInsertPlaceholder: (field: 'subject' | 'body', placeholder: string) => void;
    campaignGoal?: string;
}) {
    const [showPlaceholders, setShowPlaceholders] = useState(false);
    const [showTemplatePicker, setShowTemplatePicker] = useState(false);
    const [showSavePopover, setShowSavePopover] = useState(false);
    const [saveTemplateName, setSaveTemplateName] = useState('');
    const [saveTemplateCategory, setSaveTemplateCategory] = useState(campaignGoal || 'GENERAL');
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);

    async function handleSaveAsTemplate() {
        if (!saveTemplateName.trim() || !subject.trim() || !body.trim()) return;
        setIsSavingTemplate(true);
        try {
            await createTemplateAction({
                name: saveTemplateName,
                subject,
                body,
                category: saveTemplateCategory,
                isShared: false,
            });
            setShowSavePopover(false);
            setSaveTemplateName('');
        } finally {
            setIsSavingTemplate(false);
        }
    }

    return (
        <div>
            {/* Template buttons */}
            <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.5rem' }}>
                <button
                    onClick={() => setShowTemplatePicker(true)}
                    style={{
                        padding: '0.25rem 0.625rem', borderRadius: 'var(--radius-full)',
                        border: '1px solid var(--border)', background: 'transparent',
                        cursor: 'pointer', fontSize: '10px', fontWeight: 500, color: 'var(--text-secondary)',
                    }}
                >
                    Use Template
                </button>
                {subject.trim() && body.trim() && (
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowSavePopover(!showSavePopover)}
                            style={{
                                padding: '0.25rem 0.625rem', borderRadius: 'var(--radius-full)',
                                border: '1px solid var(--border)', background: 'transparent',
                                cursor: 'pointer', fontSize: '10px', fontWeight: 500, color: 'var(--text-secondary)',
                            }}
                        >
                            Save as Template
                        </button>
                        {showSavePopover && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, marginTop: '0.25rem',
                                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-xs)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                zIndex: 10, padding: '0.75rem', width: '240px',
                            }}>
                                <input
                                    type="text"
                                    value={saveTemplateName}
                                    onChange={e => setSaveTemplateName(e.target.value)}
                                    placeholder="Template name"
                                    style={{
                                        width: '100%', padding: '0.375rem 0.5rem', borderRadius: 'var(--radius-xs)',
                                        border: '1px solid var(--border)', fontSize: 'var(--text-xs)',
                                        marginBottom: '0.5rem', outline: 'none',
                                    }}
                                />
                                <select
                                    value={saveTemplateCategory}
                                    onChange={e => setSaveTemplateCategory(e.target.value)}
                                    style={{
                                        width: '100%', padding: '0.375rem 0.5rem', borderRadius: 'var(--radius-xs)',
                                        border: '1px solid var(--border)', fontSize: 'var(--text-xs)',
                                        marginBottom: '0.5rem', cursor: 'pointer',
                                    }}
                                >
                                    <option value="GENERAL">General</option>
                                    <option value="COLD_OUTREACH">Cold Outreach</option>
                                    <option value="FOLLOW_UP">Follow Up</option>
                                    <option value="RETARGETING">Retargeting</option>
                                    <option value="PROJECT_UPDATE">Project Update</option>
                                </select>
                                <button
                                    onClick={handleSaveAsTemplate}
                                    disabled={isSavingTemplate || !saveTemplateName.trim()}
                                    style={{
                                        width: '100%', padding: '0.375rem', borderRadius: 'var(--radius-xs)',
                                        border: 'none', background: 'var(--accent)', color: '#fff',
                                        cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 500,
                                        opacity: isSavingTemplate || !saveTemplateName.trim() ? 0.5 : 1,
                                    }}
                                >
                                    {isSavingTemplate ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <TemplatePickerModal
                isOpen={showTemplatePicker}
                onClose={() => setShowTemplatePicker(false)}
                onSelect={(tmpl) => {
                    onSubjectChange(tmpl.subject);
                    onBodyChange(tmpl.body);
                }}
                defaultCategory={campaignGoal}
            />

            <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-secondary)' }}>Subject</label>
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowPlaceholders(!showPlaceholders)}
                            style={{
                                padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-xs)',
                                border: '1px solid var(--border)', background: 'transparent',
                                cursor: 'pointer', fontSize: '10px', color: 'var(--text-tertiary)',
                            }}
                        >
                            {'{{ }}'}
                        </button>
                        {showPlaceholders && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '0.25rem',
                                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-xs)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                zIndex: 10, minWidth: '150px',
                            }}>
                                {PLACEHOLDERS.map(ph => (
                                    <button
                                        key={ph.value}
                                        onClick={() => { onInsertPlaceholder('subject', ph.value); setShowPlaceholders(false); }}
                                        style={{
                                            display: 'block', width: '100%', textAlign: 'left',
                                            padding: '0.5rem 0.75rem', border: 'none', background: 'transparent',
                                            cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-primary)',
                                        }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                    >
                                        {ph.label} <span style={{ color: 'var(--text-tertiary)' }}>{ph.value}</span>
                                    </button>
                                ))}
                                <div style={{ borderTop: '1px solid var(--border)' }}>
                                    {PLACEHOLDERS.map(ph => (
                                        <button
                                            key={`body-${ph.value}`}
                                            onClick={() => { onInsertPlaceholder('body', ph.value); setShowPlaceholders(false); }}
                                            style={{
                                                display: 'block', width: '100%', textAlign: 'left',
                                                padding: '0.5rem 0.75rem', border: 'none', background: 'transparent',
                                                cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-primary)',
                                            }}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                        >
                                            {ph.label} (body)
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <input
                    type="text"
                    value={subject}
                    onChange={e => onSubjectChange(e.target.value)}
                    placeholder="Email subject line..."
                    style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border)', fontSize: 'var(--text-sm)',
                        background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none',
                    }}
                />
            </div>
            <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
                    Body
                </label>
                <textarea
                    value={body}
                    onChange={e => onBodyChange(e.target.value)}
                    placeholder="Write your email body here... Use {{first_name}}, {{company}} for personalization"
                    rows={6}
                    style={{
                        width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border)', fontSize: 'var(--text-sm)',
                        background: 'var(--bg-surface)', color: 'var(--text-primary)',
                        resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                        lineHeight: 1.6,
                    }}
                />
            </div>
        </div>
    );
}
