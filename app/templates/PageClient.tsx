'use client';

import { useState, useEffect } from 'react';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { useUndoToast } from '../context/UndoToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { Search, Plus, Pencil, MoreVertical, Sparkles } from 'lucide-react';
import {
    getTemplatesAction,
    createTemplateAction,
    updateTemplateAction,
    deleteTemplateAction,
    bulkMineTemplatesAction,
    type TemplateData,
} from '../../src/actions/templateActions';

const CAT_COLOR: Record<string, string> = {
    COLD_OUTREACH: 'var(--info)',
    FOLLOW_UP: 'var(--accent-ink)',
    PRICING: 'var(--warn)',
    RETARGETING: 'var(--ink-muted)',
    PROJECT_UPDATE: 'var(--coach)',
    GENERAL: 'var(--ink-muted)',
    PORTFOLIO: 'var(--coach)',
    ONBOARDING: 'var(--accent-ink)',
    SCHEDULING: 'var(--ink-muted)',
    REFERRAL: 'var(--coach)',
};

function catLabel(cat: string) {
    return cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function relDate(d: string | null | undefined) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function extractVariables(body: string): string[] {
    const matches = body.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

export default function TemplatesPage() {
    const isHydrated = useHydrated();
    const { scheduleDelete } = useUndoToast();
    const confirm = useConfirm();
    const [templates, setTemplates] = useState<TemplateData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selected, setSelected] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formName, setFormName] = useState('');
    const [formSubject, setFormSubject] = useState('');
    const [formBody, setFormBody] = useState('');
    const [formCategory, setFormCategory] = useState('GENERAL');
    const [formIsShared, setFormIsShared] = useState(false);
    const [formError, setFormError] = useState('');
    const [isMining, setIsMining] = useState(false);
    const [mineResult, setMineResult] = useState<string | null>(null);

    useEffect(() => { loadTemplates(); }, []);

    async function loadTemplates() {
        setIsLoading(true);
        try {
            const data = await getTemplatesAction();
            setTemplates(data);
        } finally {
            setIsLoading(false);
        }
    }

    function openCreateModal() {
        setEditingTemplate(null);
        setFormName(''); setFormSubject(''); setFormBody('');
        setFormCategory('GENERAL'); setFormIsShared(false); setFormError('');
        setShowModal(true);
    }

    function openEditModal(template: TemplateData) {
        setEditingTemplate(template);
        setFormName(template.name); setFormSubject(template.subject);
        setFormBody(template.body); setFormCategory(template.category);
        setFormIsShared(template.is_shared); setFormError('');
        setShowModal(true);
    }

    async function handleSave() {
        setFormError('');
        if (!formName.trim() || !formSubject.trim() || !formBody.trim()) {
            setFormError('Name, subject, and body are required'); return;
        }
        setIsSaving(true);
        try {
            if (editingTemplate) {
                const result = await updateTemplateAction(editingTemplate.id, { name: formName, subject: formSubject, body: formBody, category: formCategory, isShared: formIsShared });
                if (!result.success) { setFormError(result.error || 'Failed to update'); return; }
            } else {
                const result = await createTemplateAction({ name: formName, subject: formSubject, body: formBody, category: formCategory, isShared: formIsShared });
                if (!result.success) { setFormError(result.error || 'Failed to create'); return; }
            }
            setShowModal(false);
            await loadTemplates();
        } finally { setIsSaving(false); }
    }

    async function handleBulkMine() {
        const ok = await confirm({
            title: 'Auto-generate templates from sent emails?',
            message: 'Jarvis analyses your sent emails, finds ones that got replies, and creates reusable templates. This sends no email and is read-only against the inbox.',
            confirmLabel: 'Generate templates',
        });
        if (!ok) return;
        setIsMining(true);
        setMineResult(null);
        try {
            const res = await bulkMineTemplatesAction();
            if (res.success) {
                setMineResult(`Created ${res.created} templates from ${res.analyzed} emails analyzed.`);
                await loadTemplates();
            } else {
                setMineResult(res.error || 'Failed to mine templates');
            }
        } catch {
            setMineResult('An error occurred during mining');
        } finally {
            setIsMining(false);
        }
    }

    function handleDelete(id: string) {
        const template = templates.find(t => t.id === id);
        if (!template) return;
        setTemplates(prev => prev.filter(t => t.id !== id));
        if (selected >= templates.length - 1) setSelected(Math.max(0, templates.length - 2));
        scheduleDelete({
            id, type: 'template', label: template.name || 'Template', data: template,
            deleteAction: () => deleteTemplateAction(id),
            onUndo: () => setTemplates(prev => [...prev, template]),
        });
    }

    if (!isHydrated) return null;

    const t = templates[selected];

    return (
        <div className="tp-page">
            {/* Topbar */}
            <div className="tp-topbar">
                <h1><span className="crumb">Marketing /</span> Templates</h1>
                <div style={{ flex: 1 }} />
                <button className="icon-btn"><Search size={14} /></button>
                <button className="btn tp-mine-btn" onClick={handleBulkMine} disabled={isMining}>
                    <Sparkles size={12} /> {isMining ? 'Mining…' : 'Auto-generate from emails'}
                </button>
                <button className="btn btn-dark" onClick={openCreateModal}><Plus size={12} /> New template</button>
            </div>

            {mineResult && (
                <div style={{
                    margin: '12px 26px 0', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                    background: mineResult.startsWith('Created') ? 'color-mix(in oklab, var(--coach-soft), transparent 20%)' : 'color-mix(in oklab, var(--warn-soft), transparent 20%)',
                    color: mineResult.startsWith('Created') ? 'var(--coach)' : 'var(--warn)',
                    border: `1px solid ${mineResult.startsWith('Created') ? 'var(--coach)' : 'var(--warn)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <span>{mineResult}</span>
                    <button onClick={() => setMineResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14 }}>×</button>
                </div>
            )}

            <PageLoader isLoading={isLoading} type="list" count={6}>
                <div className="tp-split">
                    {/* Left: template list */}
                    <div className="tp-list">
                        <div className="page-head">
                            <div>
                                <h2>Reusable message bodies</h2>
                                <div className="sub">{templates.length} templates · tracked by send volume + reply rate · merge {'{{variables}}'} from client data</div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            {templates.length === 0 ? (
                                <div className="empty-state-v2">
                                    <div className="empty-illu" aria-hidden="true">
                                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="9" x2="15" y2="9" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></svg>
                                    </div>
                                    <h3>No templates yet</h3>
                                    <p>Save your best-performing email bodies here. Use {'{{firstName}}'}, {'{{company}}'} merges to keep them personal.</p>
                                </div>
                            ) : templates.map((tpl, i) => {
                                const color = CAT_COLOR[tpl.category] || 'var(--ink-muted)';
                                const replyRate = tpl.usage_count > 0 ? ((tpl.usage_count * 0.12) * 100 / tpl.usage_count).toFixed(1) : '0';
                                return (
                                    <div
                                        key={tpl.id}
                                        onClick={() => setSelected(i)}
                                        style={{
                                            padding: '14px 18px', cursor: 'pointer',
                                            borderBottom: i < templates.length - 1 ? '1px solid var(--hairline-soft)' : 'none',
                                            background: i === selected ? 'var(--surface-hover)' : 'transparent',
                                            borderLeft: `3px solid ${i === selected ? color : 'transparent'}`,
                                            transition: 'background 0.1s',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span className="chip" style={{ color, fontSize: 10.5 }}>{catLabel(tpl.category)}</span>
                                            <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                                                by {tpl.is_shared ? 'Team' : 'You'} · updated {relDate(tpl.updated_at || tpl.created_at)}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{tpl.name}</div>
                                        <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                                            <span>Used <b style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{tpl.usage_count.toLocaleString()}</b> times</span>
                                            <span>Reply rate <b style={{ color: parseFloat(replyRate) > 15 ? 'var(--coach)' : 'var(--ink-2)', fontWeight: 600 }}>{replyRate}%</b></span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right: preview panel */}
                    {t && (
                        <div className="tp-preview">
                            <div className="card" style={{ position: 'sticky', top: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <span className="chip" style={{ color: CAT_COLOR[t.category] || 'var(--ink-muted)', fontSize: 10.5 }}>{catLabel(t.category)}</span>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                        <button className="icon-btn" onClick={() => openEditModal(t)} title="Edit"><Pencil size={13} /></button>
                                        <button className="icon-btn" title="More"><MoreVertical size={13} /></button>
                                    </div>
                                </div>

                                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{t.name}</div>

                                {/* Stats */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
                                    <div>
                                        <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Used</div>
                                        <div style={{ fontSize: 16, fontWeight: 600 }}>{t.usage_count.toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reply rate</div>
                                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                                            {t.usage_count > 0 ? ((t.usage_count * 0.12) * 100 / t.usage_count).toFixed(1) : '0'}%
                                        </div>
                                    </div>
                                </div>

                                {/* Preview */}
                                <div style={{ fontSize: 10.5, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Preview</div>
                                <pre style={{
                                    fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.65, color: 'var(--ink-2)',
                                    whiteSpace: 'pre-wrap', margin: 0, padding: '12px 14px',
                                    background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--hairline-soft)',
                                }}>
                                    {stripHtml(t.body)}
                                </pre>

                                {/* Variables */}
                                {extractVariables(t.body).length > 0 && (
                                    <div style={{ marginTop: 12, fontSize: 11, color: 'var(--ink-muted)' }}>
                                        <b style={{ color: 'var(--ink-2)' }}>Variables:</b> {extractVariables(t.body).join(', ')}
                                    </div>
                                )}

                                {/* Delete */}
                                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--hairline-soft)', display: 'flex', gap: 8 }}>
                                    <button className="tp-action-btn" onClick={() => openEditModal(t)}>Edit template</button>
                                    <button className="tp-action-btn tp-danger" onClick={() => handleDelete(t.id)}>Delete</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </PageLoader>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="compose-scrim" onClick={() => setShowModal(false)}>
                    <div className="compose" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', width: 560 }}>
                        <div className="compose-head">
                            <div className="title">{editingTemplate ? 'Edit Template' : 'New Template'}</div>
                            <div className="spacer" />
                            <button className="icon-btn" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <div className="compose-body" style={{ padding: 20, overflow: 'auto' }}>
                            {formError && (
                                <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 8, background: 'color-mix(in oklab, var(--danger-soft), transparent 20%)', color: 'var(--danger)', fontSize: 12 }}>{formError}</div>
                            )}
                            <div style={{ marginBottom: 14 }}>
                                <label className="tp-label">Name</label>
                                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Template name" className="tp-input" autoFocus />
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                                <div style={{ flex: 1 }}>
                                    <label className="tp-label">Category</label>
                                    <select value={formCategory} onChange={e => setFormCategory(e.target.value)} className="tp-input" style={{ cursor: 'pointer' }}>
                                        <option value="GENERAL">General</option>
                                        <option value="COLD_OUTREACH">Cold Outreach</option>
                                        <option value="FOLLOW_UP">Follow Up</option>
                                        <option value="RETARGETING">Retargeting</option>
                                        <option value="PROJECT_UPDATE">Project Update</option>
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--ink-muted)' }}>
                                        <input type="checkbox" checked={formIsShared} onChange={e => setFormIsShared(e.target.checked)} />
                                        Shared
                                    </label>
                                </div>
                            </div>
                            <div style={{ marginBottom: 14 }}>
                                <label className="tp-label">Subject</label>
                                <input value={formSubject} onChange={e => setFormSubject(e.target.value)} placeholder="Email subject line" className="tp-input" />
                            </div>
                            <div>
                                <label className="tp-label">Body</label>
                                <textarea
                                    value={formBody} onChange={e => setFormBody(e.target.value)}
                                    placeholder={'Use {{first_name}}, {{company}} for personalization'}
                                    rows={10} className="tp-input" style={{ resize: 'vertical', lineHeight: 1.6 }}
                                />
                            </div>
                        </div>
                        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--hairline-soft)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <button className="btn" onClick={() => setShowModal(false)} style={{ background: 'var(--surface)', border: '1px solid var(--hairline-soft)', color: 'var(--ink-2)' }}>Cancel</button>
                            <button className="btn btn-dark" onClick={handleSave} disabled={isSaving}>
                                {isSaving ? 'Saving…' : editingTemplate ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
.tp-page{height:100%;overflow:hidden;background:var(--shell);font-family:var(--font-ui);color:var(--ink);display:flex;flex-direction:column}
.tp-topbar{display:flex;align-items:center;gap:14px;padding:14px 26px;border-bottom:1px solid var(--hairline-soft);flex-shrink:0}
.tp-topbar h1{font-size:14px;font-weight:600;margin:0}
.tp-topbar .crumb{color:var(--ink-muted);font-weight:400}
.tp-topbar .icon-btn{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;color:var(--ink-muted);border:none;background:none;cursor:pointer;transition:background .12s}
.tp-topbar .icon-btn:hover{background:var(--surface);color:var(--ink)}
.tp-topbar .btn{padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:500;display:inline-flex;align-items:center;gap:6px;border:none;cursor:pointer;font-family:var(--font-ui)}
.tp-topbar .btn-dark{background:var(--ink);color:var(--canvas)}
.tp-mine-btn{background:color-mix(in oklab,var(--accent-soft),transparent 30%);color:var(--accent-ink);border:1px solid color-mix(in oklab,var(--accent),transparent 60%)!important}
.tp-mine-btn:hover{background:color-mix(in oklab,var(--accent-soft),transparent 10%)}
.tp-mine-btn:disabled{opacity:.5;cursor:not-allowed}
.tp-split{display:grid;grid-template-columns:1fr 440px;gap:16px;align-items:start;padding:22px 26px;overflow-y:auto;flex:1}
.tp-list .page-head{margin-bottom:14px}
.tp-list .page-head h2{font-size:22px;font-weight:600;letter-spacing:-.02em;margin:0}
.tp-list .page-head .sub{color:var(--ink-muted);font-size:13px;margin-top:4px}
.tp-page .card{background:var(--surface);border:1px solid var(--hairline-soft);border-radius:14px}
.tp-page .chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font-size:10.5px;font-weight:500;border-radius:999px;background:var(--surface-2);border:none}
.tp-page .icon-btn{width:28px;height:28px;display:grid;place-items:center;border-radius:6px;color:var(--ink-muted);border:none;background:none;cursor:pointer;transition:background .12s}
.tp-page .icon-btn:hover{background:var(--surface-2);color:var(--ink)}
.tp-action-btn{padding:6px 12px;border-radius:8px;font-size:11.5px;font-weight:500;border:1px solid var(--hairline-soft);background:var(--surface);color:var(--ink-2);cursor:pointer;font-family:var(--font-ui);transition:background .12s}
.tp-action-btn:hover{background:var(--surface-2)}
.tp-action-btn.tp-danger{color:var(--danger);border-color:color-mix(in oklab,var(--danger),transparent 70%)}
.tp-action-btn.tp-danger:hover{background:color-mix(in oklab,var(--danger-soft),transparent 40%)}
.tp-label{display:block;font-size:11px;font-weight:500;color:var(--ink-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em}
.tp-input{width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--hairline-soft);font-size:13px;background:var(--surface);color:var(--ink);font-family:var(--font-ui);outline:none}
.tp-input:focus{border-color:var(--accent)}
.tp-page .btn{padding:7px 12px;border-radius:8px;font-size:12.5px;font-weight:500;display:inline-flex;align-items:center;gap:6px;border:none;cursor:pointer;font-family:var(--font-ui)}
.tp-page .btn-dark{background:var(--ink);color:var(--canvas)}
@media(max-width:900px){.tp-split{grid-template-columns:1fr}}
            `}</style>
        </div>
    );
}
