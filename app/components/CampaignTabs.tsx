'use client';

import React, { useState } from 'react';

// ─── Shared UI Helpers ───────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>{title}</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {children}
            </div>
        </div>
    );
}

function Toggle({ label, description, checked, onChange }: {
    label: string; description?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
    return (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', padding: '0.375rem 0' }}>
            <input
                type="checkbox" checked={checked}
                onChange={e => onChange(e.target.checked)}
                style={{ marginTop: '2px', accentColor: 'var(--accent)' }}
            />
            <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
                {description && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>{description}</div>}
            </div>
        </label>
    );
}

function NumberInput({ label, value, onChange, placeholder, suffix, min, max }: {
    label: string; value: number | string; onChange: (v: string) => void;
    placeholder?: string; suffix?: string; min?: number; max?: number;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', minWidth: '160px' }}>{label}</label>
            <input
                type="number" min={min} max={max}
                value={value} placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                style={{
                    width: '80px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                    padding: '0.375rem 0.5rem', fontSize: 'var(--text-sm)', background: 'var(--bg-surface)',
                    color: 'var(--text-primary)', outline: 'none',
                }}
            />
            {suffix && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{suffix}</span>}
        </div>
    );
}

function TagInput({ label, values, onChange, placeholder }: {
    label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
    const [input, setInput] = useState('');
    const addTag = () => {
        const val = input.trim();
        if (val && val.includes('@') && !values.includes(val)) {
            onChange([...values, val]);
            setInput('');
        }
    };
    return (
        <div>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, display: 'block', marginBottom: '0.375rem' }}>{label}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.375rem' }}>
                {values.map(v => (
                    <span key={v} style={{
                        fontSize: 'var(--text-xs)', background: 'var(--bg-elevated)', padding: '0.125rem 0.5rem',
                        borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', gap: '0.25rem',
                    }}>
                        {v}
                        <button onClick={() => onChange(values.filter(x => x !== v))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '12px' }}>x</button>
                    </span>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
                <input value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    placeholder={placeholder}
                    style={{
                        flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                        padding: '0.375rem 0.5rem', fontSize: 'var(--text-sm)', background: 'var(--bg-surface)',
                        color: 'var(--text-primary)', outline: 'none',
                    }}
                />
                <button onClick={addTag} style={{
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                    padding: '0.375rem 0.75rem', fontSize: 'var(--text-xs)', background: 'var(--bg-surface)',
                    cursor: 'pointer', color: 'var(--text-primary)',
                }}>Add</button>
            </div>
        </div>
    );
}

// ─── Options Tab ─────────────────────────────────────────────────────────────

export function CampaignOptionsTab({ campaign, onSave }: { campaign: any; onSave: (updates: Record<string, any>) => Promise<void> }) {
    const [saving, setSaving] = useState(false);
    const [local, setLocal] = useState({ ...campaign });

    const save = async (updates: Record<string, any>) => {
        setLocal({ ...local, ...updates });
        setSaving(true);
        await onSave(updates);
        setSaving(false);
    };

    return (
        <div style={{ maxWidth: '600px' }}>
            {saving && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginBottom: '0.5rem' }}>Saving...</div>}

            <Section title="Sending Behavior">
                <Toggle label="Stop sending on reply" checked={local.auto_stop_on_reply ?? true}
                    onChange={v => save({ auto_stop_on_reply: v })} />
                <Toggle label="Stop on auto-reply (out-of-office)" checked={local.stop_on_auto_reply ?? true}
                    onChange={v => save({ stop_on_auto_reply: v })} />
                <Toggle label="Stop for entire company on reply"
                    description="One person replies = stop all contacts from that company"
                    checked={local.stop_for_company ?? false}
                    onChange={v => save({ stop_for_company: v })} />
                <Toggle label="Prioritize new leads"
                    description="By default follow-ups go first"
                    checked={local.prioritize_new_leads ?? false}
                    onChange={v => save({ prioritize_new_leads: v })} />
            </Section>

            <Section title="Email Format">
                <Toggle label="Send all emails as text-only (no HTML)"
                    description="Better deliverability"
                    checked={local.text_only ?? false}
                    onChange={v => save({ text_only: v })} />
                <Toggle label="First email text-only only"
                    checked={local.first_email_text_only ?? false}
                    onChange={v => save({ first_email_text_only: v })} />
            </Section>

            <Section title="Tracking">
                <Toggle label="Link click tracking" checked={local.link_tracking ?? true}
                    onChange={v => save({ link_tracking: v })} />
            </Section>

            <Section title="Email Sending Gap">
                <NumberInput label="Gap between emails:" value={local.email_gap_minutes ?? 10}
                    onChange={v => save({ email_gap_minutes: parseInt(v) || 10 })} suffix="minutes" min={1} max={120} />
                <NumberInput label="Random wait max:" value={local.random_wait_max ?? 5}
                    onChange={v => save({ random_wait_max: parseInt(v) || 5 })} suffix="minutes (+/-)" min={0} max={30} />
            </Section>

            <Section title="CC / BCC">
                <TagInput label="CC" placeholder="email@example.com"
                    values={local.cc_list ?? []} onChange={v => save({ cc_list: v })} />
                <TagInput label="BCC" placeholder="email@example.com"
                    values={local.bcc_list ?? []} onChange={v => save({ bcc_list: v })} />
            </Section>

            <Section title="A/B Auto-optimize">
                <select value={local.auto_variant_select ?? ''}
                    onChange={e => save({ auto_variant_select: e.target.value || null })}
                    style={{
                        width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                        padding: '0.5rem', fontSize: 'var(--text-sm)', background: 'var(--bg-surface)',
                        color: 'var(--text-primary)', outline: 'none',
                    }}>
                    <option value="">Off — manual A/B</option>
                    <option value="reply_rate">Optimize for Reply Rate</option>
                    <option value="open_rate">Optimize for Open Rate</option>
                    <option value="click_rate">Optimize for Click Rate</option>
                </select>
            </Section>

            <Section title="Daily Limits">
                <NumberInput label="Max emails/day (campaign):" value={local.daily_send_limit ?? 50}
                    onChange={v => save({ daily_send_limit: parseInt(v) || 50 })} min={1} />
                <NumberInput label="Max new leads/day:" value={local.daily_max_new_leads ?? ''}
                    onChange={v => save({ daily_max_new_leads: v ? parseInt(v) : null })} placeholder="Unlimited" min={1} />
            </Section>
        </div>
    );
}

// ─── Schedule Tab ────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMEZONES = [
    'UTC', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dubai',
    'America/New_York', 'America/Los_Angeles', 'America/Chicago',
    'Europe/London', 'Europe/Paris', 'Asia/Singapore', 'Australia/Sydney',
];

export function CampaignScheduleTab({ campaign, onSave }: { campaign: any; onSave: (updates: Record<string, any>) => Promise<void> }) {
    const [saving, setSaving] = useState(false);
    const [local, setLocal] = useState({ ...campaign });

    const save = async (updates: Record<string, any>) => {
        setLocal({ ...local, ...updates });
        setSaving(true);
        await onSave(updates);
        setSaving(false);
    };

    const scheduleDays: number[] = local.schedule_days ?? [1, 2, 3, 4, 5];

    return (
        <div style={{ maxWidth: '500px' }}>
            {saving && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginBottom: '0.5rem' }}>Saving...</div>}

            <Toggle label="Enable schedule"
                description="Only send emails within the specified time window"
                checked={local.schedule_enabled ?? false}
                onChange={v => save({ schedule_enabled: v })} />

            {local.schedule_enabled && (
                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Days */}
                    <div>
                        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Sending days</p>
                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                            {DAYS.map((day, i) => (
                                <button key={day}
                                    onClick={() => {
                                        const days = scheduleDays.includes(i)
                                            ? scheduleDays.filter(d => d !== i)
                                            : [...scheduleDays, i].sort();
                                        save({ schedule_days: days });
                                    }}
                                    style={{
                                        padding: '0.375rem 0.875rem', borderRadius: 'var(--radius-full)',
                                        fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer',
                                        border: 'none', transition: 'all 0.15s ease',
                                        background: scheduleDays.includes(i) ? 'var(--accent)' : 'var(--bg-elevated)',
                                        color: scheduleDays.includes(i) ? 'white' : 'var(--text-secondary)',
                                    }}
                                >{day}</button>
                            ))}
                        </div>
                    </div>

                    {/* Time window */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div>
                            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.25rem' }}>From</label>
                            <input type="time" value={local.schedule_start_time ?? '09:00'}
                                onChange={e => save({ schedule_start_time: e.target.value })}
                                style={{
                                    border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                                    padding: '0.375rem 0.5rem', fontSize: 'var(--text-sm)',
                                    background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none',
                                }} />
                        </div>
                        <span style={{ color: 'var(--text-tertiary)', paddingTop: '1rem' }}>—</span>
                        <div>
                            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.25rem' }}>To</label>
                            <input type="time" value={local.schedule_end_time ?? '17:00'}
                                onChange={e => save({ schedule_end_time: e.target.value })}
                                style={{
                                    border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                                    padding: '0.375rem 0.5rem', fontSize: 'var(--text-sm)',
                                    background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none',
                                }} />
                        </div>
                    </div>

                    {/* Timezone */}
                    <div>
                        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.25rem' }}>Timezone</label>
                        <select value={local.schedule_timezone ?? 'UTC'}
                            onChange={e => save({ schedule_timezone: e.target.value })}
                            style={{
                                width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                                padding: '0.5rem', fontSize: 'var(--text-sm)',
                                background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none',
                            }}>
                            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                        </select>
                    </div>

                    {/* Date range */}
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.25rem' }}>Start date (optional)</label>
                            <input type="date"
                                value={local.schedule_start_date ? new Date(local.schedule_start_date).toISOString().split('T')[0] : ''}
                                onChange={e => save({ schedule_start_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                style={{
                                    width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                                    padding: '0.375rem 0.5rem', fontSize: 'var(--text-sm)',
                                    background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none',
                                }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block', marginBottom: '0.25rem' }}>End date (optional)</label>
                            <input type="date"
                                value={local.schedule_end_date ? new Date(local.schedule_end_date).toISOString().split('T')[0] : ''}
                                onChange={e => save({ schedule_end_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                style={{
                                    width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)',
                                    padding: '0.375rem 0.5rem', fontSize: 'var(--text-sm)',
                                    background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none',
                                }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
