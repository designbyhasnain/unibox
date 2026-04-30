'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import Topbar from '../../components/Topbar';
import {
    getContactDetailAction,
    updateContactAction,
    getOwnershipTransferHistoryAction,
    type OwnershipTransferEntry,
} from '../../../src/actions/contactDetailActions';
import { generateAISummaryAction } from '../../../src/actions/summaryActions';
import OwnerPicker from '../../components/OwnerPicker';
import { avatarColor, initials } from '../../utils/helpers';
import { STAGE_LABELS, STAGE_COLORS } from '../../constants/stages';

const firstName = (full?: string | null) => (full || '').trim().split(/\s+/)[0] || '';

// Strict DOMPurify config for inline email-body rendering. Drops scripts,
// event handlers, and any href/src that isn't http(s) or mailto. The previous
// implementation used a regex strip of <script> tags only, which left
// onerror=, javascript: URIs, iframe srcdoc, etc. as live XSS sinks against
// any agent who expanded an email.
function sanitizeEmailHtml(raw: string): string {
    if (typeof window === 'undefined') return ''; // DOMPurify needs a DOM
    return DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: [
            'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
            'hr', 'i', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'table', 'tbody',
            'td', 'th', 'thead', 'tr', 'u', 'ul', 'img',
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'class'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'srcdoc'],
    });
}

const sourceLabel = (s: string) => {
    switch (s) {
        case 'manual': return 'manual edit';
        case 'bulk': return 'bulk reassignment';
        case 'admin_override': return 'admin override';
        case 'import': return 'CSV import';
        case 'campaign': return 'campaign enrollment';
        case 'scraper': return 'lead scraper';
        case 'invite': return 'invitation accepted';
        case 'system': return 'automated';
        default: return s;
    }
};

export default function ContactDetailPage() {
    const params = useParams();
    const router = useRouter();
    const contactId = params.id as string;

    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'emails' | 'projects' | 'activity'>('emails');
    const [expandedThread, setExpandedThread] = useState<string | null>(null);
    const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', company: '', phone: '', notes: '' });
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [history, setHistory] = useState<OwnershipTransferEntry[] | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const result = await getContactDetailAction(contactId);
        setData(result);
        if (result?.contact) {
            setEditForm({
                name: result.contact.name || '',
                company: result.contact.company || '',
                phone: result.contact.phone || '',
                notes: result.contact.notes || '',
            });
        }
        setLoading(false);
    }, [contactId]);

    const refreshHistory = useCallback(async () => {
        try {
            const result = await getOwnershipTransferHistoryAction(contactId);
            if (result.success) setHistory(result.entries);
        } catch { /* ignore */ }
    }, [contactId]);

    const toggleHistory = useCallback(async () => {
        if (historyOpen) { setHistoryOpen(false); return; }
        setHistoryOpen(true);
        if (history !== null) return;
        setHistoryLoading(true);
        await refreshHistory();
        setHistoryLoading(false);
    }, [historyOpen, history, refreshHistory]);

    const handleTransferred = useCallback(async (_newOwner: { id: string | null; name: string | null }) => {
        await Promise.all([load(), refreshHistory()]);
        setHistoryOpen(true);
    }, [load, refreshHistory]);

    useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        await updateContactAction(contactId, editForm);
        setEditing(false);
        load();
    };

    const handleAiAudit = async () => {
        if (!data?.contact) return;
        setAiLoading(true);
        try {
            const result = await generateAISummaryAction(contactId);
            setAiSummary(typeof result === 'string' ? result : (result as any)?.summary || 'No summary generated');
        } catch (e: any) {
            setAiSummary('AI audit failed: ' + e.message);
        }
        setAiLoading(false);
    };

    if (loading) {
        return (
            <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
                <div style={{ padding: '0' }}>
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading contact...</div>
                </div>
            </div>
        );
    }

    if (!data?.contact) {
        return (
            <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
                <div style={{ padding: '0' }}>
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Contact not found</div>
                </div>
            </div>
        );
    }

    const c = data.contact;
    const stageLabel = STAGE_LABELS[c.pipeline_stage] || c.pipeline_stage;
    const stageColor = STAGE_COLORS[c.pipeline_stage] || 'badge-gray';
    const fmt = (v: number) => '$' + (v || 0).toLocaleString();

    return (
        <div style={{ height: '100%', overflow: 'auto', background: 'var(--shell)', fontFamily: 'var(--font-ui)', color: 'var(--ink)' }}>
            <div style={{ padding: '0' }}>
                <Topbar searchTerm="" setSearchTerm={() => {}} placeholder="Contact"
                    onSearch={() => {}} onClearSearch={() => {}}
                    leftContent={
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button onClick={() => router.push('/clients')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 14 }}>← Clients</button>
                            <h1 className="clients-page-title">{c.name || c.email}</h1>
                        </div>
                    }
                    rightContent={
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-secondary sm" onClick={() => setEditing(!editing)}>{editing ? 'Cancel' : 'Edit'}</button>
                            <button className="btn btn-primary sm" onClick={handleAiAudit} disabled={aiLoading}>
                                {aiLoading ? 'Analyzing...' : 'AI Audit'}
                            </button>
                        </div>
                    }
                />

                <div style={{ padding: '1.5rem', overflowY: 'auto', height: 'calc(100vh - 60px)' }}>
                    {/* Profile Header */}
                    <div style={{ display: 'flex', gap: 20, marginBottom: 24, alignItems: 'flex-start' }}>
                        <div className="avatar" style={{ background: avatarColor(c.email), width: 64, height: 64, fontSize: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#fff', fontWeight: 700 }}>
                            {initials(c.name || '?')}
                        </div>
                        <div style={{ flex: 1 }}>
                            {editing ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                                    <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }} />
                                    <input value={editForm.company} onChange={e => setEditForm({ ...editForm, company: e.target.value })} placeholder="Company" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }} />
                                    <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Phone" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }} />
                                    <button onClick={handleSave} className="btn btn-primary sm">Save</button>
                                    <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notes" rows={2} style={{ gridColumn: '1 / -1', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, resize: 'vertical' }} />
                                </div>
                            ) : (
                                <>
                                    <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{c.name || 'Unknown'}</div>
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{c.email}</div>
                                    {c.company && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{c.company}</div>}
                                    {c.phone && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{c.phone}</div>}
                                    {c.notes && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, fontStyle: 'italic' }}>{c.notes}</div>}
                                </>
                            )}
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                {stageLabel && <span className={stageColor} style={{ fontSize: 11 }}>{stageLabel}</span>}
                                {c.lead_score > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(139,92,246,0.1)', color: 'var(--accent)', fontWeight: 600 }}>Score: {c.lead_score}</span>}
                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: c.relationship_health === 'warm' ? 'rgba(16,185,129,0.1)' : c.relationship_health === 'cold' ? 'rgba(239,68,68,0.1)' : 'rgba(107,114,128,0.1)', color: c.relationship_health === 'warm' ? 'var(--coach)' : c.relationship_health === 'cold' ? 'var(--danger)' : 'var(--ink-muted)' }}>{c.relationship_health || 'neutral'}</span>
                            </div>

                            {/* Ownership row + collapsible transfer history */}
                            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span>
                                    Owner:{' '}
                                    {data.currentOwner?.name
                                        ? <strong style={{ color: 'var(--text-primary)' }}>{firstName(data.currentOwner.name)}</strong>
                                        : <em style={{ color: 'var(--text-tertiary)' }}>Unassigned</em>}
                                </span>
                                <OwnerPicker
                                    contactId={contactId}
                                    currentOwnerId={data.currentOwner?.id || null}
                                    currentOwnerName={data.currentOwner?.name || null}
                                    onTransferred={handleTransferred}
                                />
                                <button
                                    onClick={toggleHistory}
                                    title="Show / hide ownership transfer history"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}
                                >
                                    {historyOpen ? 'Hide history ▴' : 'Transfer history ▾'}
                                </button>
                            </div>
                            {historyOpen && (
                                <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-secondary)' }}>
                                    {historyLoading
                                        ? <div style={{ color: 'var(--text-tertiary)' }}>Loading history…</div>
                                        : (history && history.length > 0)
                                            ? history.map(h => (
                                                <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '3px 0' }}>
                                                    <span style={{ color: 'var(--text-tertiary)', minWidth: 80 }}>{new Date(h.created_at).toLocaleDateString()}</span>
                                                    <span>
                                                        {h.from_name ? firstName(h.from_name) : <em>unassigned</em>}
                                                        {' → '}
                                                        <strong style={{ color: 'var(--text-primary)' }}>{h.to_name ? firstName(h.to_name) : <em>unassigned</em>}</strong>
                                                    </span>
                                                    <span style={{ color: 'var(--text-tertiary)' }}>· {sourceLabel(h.source as string)}</span>
                                                    {h.reason && <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>· &ldquo;{h.reason}&rdquo;</span>}
                                                </div>
                                            ))
                                            : <div style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No transfers recorded yet.</div>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
                        {[
                            { label: 'Emails Sent', value: data.stats.sent, color: 'var(--accent)' },
                            { label: 'Emails Received', value: data.stats.received, color: 'var(--coach)' },
                            { label: 'Open Count', value: c.open_count || 0, color: 'var(--warn)' },
                            { label: 'Reply Speed', value: c.reply_speed_hours ? c.reply_speed_hours + 'h' : '—', color: 'var(--accent)' },
                            { label: 'Projects', value: data.projects.length, color: '#EC4899' },
                            { label: 'Days Silent', value: c.days_since_last_contact || 0, color: c.days_since_last_contact > 14 ? 'var(--danger)' : 'var(--ink-muted)' },
                        ].map(kpi => (
                            <div key={kpi.label} style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 14, border: '1px solid var(--border-subtle)' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{kpi.label}</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* AI Summary */}
                    {aiSummary && (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)', marginBottom: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>AI Relationship Audit</div>
                                <button onClick={() => setAiSummary(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12 }}>Close</button>
                            </div>
                            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)' }}>
                                {aiSummary.split('\n').map((line, i) => {
                                    if (line.startsWith('###')) return <h4 key={i} style={{ fontSize: 13, fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{line.replace(/^###\s*/, '')}</h4>;
                                    if (line.startsWith('##')) return <h3 key={i} style={{ fontSize: 14, fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{line.replace(/^##\s*/, '')}</h3>;
                                    if (line.startsWith('- ') || line.startsWith('* ')) return <div key={i} style={{ paddingLeft: 12, marginBottom: 2 }}>• {line.replace(/^[-*]\s*/, '')}</div>;
                                    if (line.startsWith('**')) return <div key={i} style={{ fontWeight: 600, marginTop: 8 }}>{line.replace(/\*\*/g, '')}</div>;
                                    if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
                                    return <div key={i}>{line}</div>;
                                })}
                            </div>
                        </div>
                    )}

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)' }}>
                        {(['emails', 'projects', 'activity'] as const).map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)} style={{
                                padding: '8px 20px', fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                            }}>
                                {tab === 'emails' ? `Emails (${data.stats.total})` : tab === 'projects' ? `Projects (${data.projects.length})` : `Activity (${data.activity.length})`}
                            </button>
                        ))}
                    </div>

                    {/* Email Timeline */}
                    {activeTab === 'emails' && (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                            {data.threads.length === 0 ? (
                                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No emails found</div>
                            ) : (
                                data.threads.map((thread: any) => (
                                    <div key={thread.id}>
                                        <div
                                            onClick={() => setExpandedThread(expandedThread === thread.id ? null : thread.id)}
                                            style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {thread.subject}
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                    {thread.messages.length} message{thread.messages.length > 1 ? 's' : ''}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0, marginLeft: 12 }}>
                                                {new Date(thread.lastDate).toLocaleDateString()}
                                            </div>
                                        </div>
                                        {expandedThread === thread.id && (
                                            <div style={{ background: 'var(--bg-tertiary)' }}>
                                                {thread.messages.map((email: any) => (
                                                    <div key={email.id} style={{ padding: '8px 16px 8px 32px', borderBottom: '1px solid var(--border-subtle)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <span style={{
                                                                    fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 600,
                                                                    background: email.direction === 'SENT' ? 'rgba(26,115,232,0.1)' : 'rgba(16,185,129,0.1)',
                                                                    color: email.direction === 'SENT' ? 'var(--accent)' : 'var(--coach)',
                                                                }}>{email.direction}</span>
                                                                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                                                    {email.direction === 'SENT' ? email.to_email?.split('<')[0]?.trim() : email.from_email?.split('<')[0]?.trim()}
                                                                </span>
                                                            </div>
                                                            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                                                {new Date(email.sent_at).toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <div
                                                            onClick={() => setExpandedEmail(expandedEmail === email.id ? null : email.id)}
                                                            style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, cursor: 'pointer' }}
                                                        >
                                                            {expandedEmail === email.id
                                                                ? <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)', marginTop: 8, whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml((email.body || '').slice(0, 50_000)) || (email.snippet || '') }} />
                                                                : (email.snippet?.slice(0, 120) || 'No preview')
                                                            }
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Projects Tab */}
                    {activeTab === 'projects' && (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                            {data.projects.length === 0 ? (
                                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No projects linked</div>
                            ) : (
                                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--bg-tertiary)' }}>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Project</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Value</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Paid</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>AM</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.projects.map((p: any) => (
                                            <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{p.project_name?.trim() || 'Unnamed'}</td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: p.status === 'Delivered' ? 'rgba(16,185,129,0.1)' : p.status === 'In Progress' ? 'rgba(59,130,246,0.1)' : 'rgba(107,114,128,0.1)', color: p.status === 'Delivered' ? 'var(--coach)' : p.status === 'In Progress' ? 'var(--info)' : 'var(--ink-muted)' }}>{p.status || 'Unknown'}</span>
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--coach)', fontWeight: 600 }}>{fmt(p.project_value)}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: p.paid_status === 'PAID' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: p.paid_status === 'PAID' ? 'var(--coach)' : 'var(--danger)' }}>{p.paid_status}</span>
                                                </td>
                                                <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-tertiary)' }}>
                                                    {(() => {
                                                        const closer = firstName(p.closer_name);
                                                        const owner = firstName(p.current_owner_name);
                                                        // Dual-ownership: closer != current owner (and both exist) → show both
                                                        if (closer && owner && p.closer_id && p.current_owner_id && p.closer_id !== p.current_owner_id) {
                                                            return (
                                                                <span title={`Closed by ${p.closer_name} · Currently managed by ${p.current_owner_name}`}>
                                                                    Closed by <strong style={{ color: 'var(--text-secondary)' }}>{closer}</strong> · Now: <strong style={{ color: 'var(--text-primary)' }}>{owner}</strong>
                                                                </span>
                                                            );
                                                        }
                                                        // Single owner (or matching closer = owner) → show one name; fall back to legacy string
                                                        return closer || owner || p.account_manager || '—';
                                                    })()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {/* Activity Tab */}
                    {activeTab === 'activity' && (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                            {data.activity.length === 0 ? (
                                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No activity recorded</div>
                            ) : (
                                data.activity.map((a: any) => {
                                    // activity_logs.note holds JSON for OWNERSHIP_TRANSFER; legacy rows used `details`.
                                    let parsedNote: any = null;
                                    const raw = a.note ?? a.details;
                                    if (typeof raw === 'string') {
                                        try { parsedNote = JSON.parse(raw); } catch { /* not JSON — fall back to raw text */ }
                                    } else if (raw && typeof raw === 'object') {
                                        parsedNote = raw;
                                    }
                                    let detail: React.ReactNode = null;
                                    if (a.action === 'OWNERSHIP_TRANSFER' && parsedNote) {
                                        detail = (
                                            <span>
                                                {parsedNote.from_user_id ? 'transfer' : 'assigned'}
                                                {parsedNote.source ? ` · ${sourceLabel(parsedNote.source)}` : ''}
                                                {parsedNote.reason ? ` · "${parsedNote.reason}"` : ''}
                                            </span>
                                        );
                                    } else if (a.action === 'AM_CREDIT_OVERRIDE' && parsedNote) {
                                        detail = <span>project AM override · &ldquo;{parsedNote.reason || ''}&rdquo;</span>;
                                    } else if (parsedNote) {
                                        detail = <span>{JSON.stringify(parsedNote)}</span>;
                                    } else if (typeof raw === 'string') {
                                        detail = <span>{raw}</span>;
                                    }
                                    return (
                                        <div key={a.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{a.action}</div>
                                                {detail && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{detail}</div>}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                                {new Date(a.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
