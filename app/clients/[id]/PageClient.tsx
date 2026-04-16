'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Topbar from '../../components/Topbar';
import { getContactDetailAction, updateContactAction } from '../../../src/actions/contactDetailActions';
import { generateAISummaryAction } from '../../../src/actions/summaryActions';
import { avatarColor, initials } from '../../utils/helpers';
import { STAGE_LABELS, STAGE_COLORS } from '../../constants/stages';

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
            <div className="mailbox-wrapper">
                <div className="mailbox-main">
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading contact...</div>
                </div>
            </div>
        );
    }

    if (!data?.contact) {
        return (
            <div className="mailbox-wrapper">
                <div className="mailbox-main">
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
        <div className="mailbox-wrapper">
            <div className="mailbox-main">
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
                                {c.lead_score > 0 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'rgba(139,92,246,0.1)', color: '#8B5CF6', fontWeight: 600 }}>Score: {c.lead_score}</span>}
                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: c.relationship_health === 'warm' ? 'rgba(16,185,129,0.1)' : c.relationship_health === 'cold' ? 'rgba(239,68,68,0.1)' : 'rgba(107,114,128,0.1)', color: c.relationship_health === 'warm' ? '#10B981' : c.relationship_health === 'cold' ? '#EF4444' : '#6B7280' }}>{c.relationship_health || 'neutral'}</span>
                            </div>
                        </div>
                    </div>

                    {/* KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 24 }}>
                        {[
                            { label: 'Emails Sent', value: data.stats.sent, color: '#1a73e8' },
                            { label: 'Emails Received', value: data.stats.received, color: '#10B981' },
                            { label: 'Open Count', value: c.open_count || 0, color: '#F59E0B' },
                            { label: 'Reply Speed', value: c.reply_speed_hours ? c.reply_speed_hours + 'h' : '—', color: '#8B5CF6' },
                            { label: 'Projects', value: data.projects.length, color: '#EC4899' },
                            { label: 'Days Silent', value: c.days_since_last_contact || 0, color: c.days_since_last_contact > 14 ? '#EF4444' : '#6B7280' },
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
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#8B5CF6' }}>AI Relationship Audit</div>
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
                                borderBottom: activeTab === tab ? '2px solid #1a73e8' : '2px solid transparent',
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
                                                                    color: email.direction === 'SENT' ? '#1a73e8' : '#10B981',
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
                                                                ? <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)', marginTop: 8, whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: email.body?.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').slice(0, 5000) || email.snippet || '' }} />
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
                                                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: p.status === 'Delivered' ? 'rgba(16,185,129,0.1)' : p.status === 'In Progress' ? 'rgba(59,130,246,0.1)' : 'rgba(107,114,128,0.1)', color: p.status === 'Delivered' ? '#10B981' : p.status === 'In Progress' ? '#3B82F6' : '#6B7280' }}>{p.status || 'Unknown'}</span>
                                                </td>
                                                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10B981', fontWeight: 600 }}>{fmt(p.project_value)}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: p.paid_status === 'PAID' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: p.paid_status === 'PAID' ? '#10B981' : '#EF4444' }}>{p.paid_status}</span>
                                                </td>
                                                <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-tertiary)' }}>{p.account_manager || '—'}</td>
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
                                data.activity.map((a: any) => (
                                    <div key={a.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{a.action}</div>
                                            {a.details && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{typeof a.details === 'string' ? a.details : JSON.stringify(a.details)}</div>}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                            {new Date(a.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
