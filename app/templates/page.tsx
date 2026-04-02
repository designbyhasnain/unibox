'use client';

import React, { useState, useEffect } from 'react';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import Topbar from '../components/Topbar';
import { useUndoToast } from '../context/UndoToastContext';
import {
    getTemplatesAction,
    createTemplateAction,
    updateTemplateAction,
    deleteTemplateAction,
    type TemplateData,
} from '../../src/actions/templateActions';

const CATEGORIES = [
    { value: 'ALL', label: 'All' },
    { value: 'GENERAL', label: 'General' },
    { value: 'COLD_OUTREACH', label: 'Cold Outreach' },
    { value: 'FOLLOW_UP', label: 'Follow Up' },
    { value: 'RETARGETING', label: 'Retargeting' },
    { value: 'PROJECT_UPDATE', label: 'Project Update' },
];

const CATEGORY_COLORS: Record<string, string> = {
    GENERAL: 'badge-gray',
    COLD_OUTREACH: 'badge-blue',
    FOLLOW_UP: 'badge-yellow',
    RETARGETING: 'badge-purple',
    PROJECT_UPDATE: 'badge-green',
};

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function TemplatesPage() {
    const isHydrated = useHydrated();
    const { scheduleDelete } = useUndoToast();
    const [templates, setTemplates] = useState<TemplateData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('ALL');
    const [showModal, setShowModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formSubject, setFormSubject] = useState('');
    const [formBody, setFormBody] = useState('');
    const [formCategory, setFormCategory] = useState('GENERAL');
    const [formIsShared, setFormIsShared] = useState(false);
    const [formError, setFormError] = useState('');

    useEffect(() => {
        loadTemplates();
    }, [filterCategory]);

    async function loadTemplates() {
        setIsLoading(true);
        try {
            const data = await getTemplatesAction(filterCategory !== 'ALL' ? filterCategory : undefined);
            setTemplates(data);
        } finally {
            setIsLoading(false);
        }
    }

    function openCreateModal() {
        setEditingTemplate(null);
        setFormName('');
        setFormSubject('');
        setFormBody('');
        setFormCategory('GENERAL');
        setFormIsShared(false);
        setFormError('');
        setShowModal(true);
    }

    function openEditModal(template: TemplateData) {
        setEditingTemplate(template);
        setFormName(template.name);
        setFormSubject(template.subject);
        setFormBody(template.body);
        setFormCategory(template.category);
        setFormIsShared(template.is_shared);
        setFormError('');
        setShowModal(true);
    }

    async function handleSave() {
        setFormError('');
        if (!formName.trim() || !formSubject.trim() || !formBody.trim()) {
            setFormError('Name, subject, and body are required');
            return;
        }

        setIsSaving(true);
        try {
            if (editingTemplate) {
                const result = await updateTemplateAction(editingTemplate.id, {
                    name: formName,
                    subject: formSubject,
                    body: formBody,
                    category: formCategory,
                    isShared: formIsShared,
                });
                if (!result.success) {
                    setFormError(result.error || 'Failed to update');
                    return;
                }
            } else {
                const result = await createTemplateAction({
                    name: formName,
                    subject: formSubject,
                    body: formBody,
                    category: formCategory,
                    isShared: formIsShared,
                });
                if (!result.success) {
                    setFormError(result.error || 'Failed to create');
                    return;
                }
            }
            setShowModal(false);
            await loadTemplates();
        } finally {
            setIsSaving(false);
        }
    }

    function handleDelete(id: string) {
        const template = templates.find(t => t.id === id);
        if (!template) return;
        // Optimistic: remove from UI immediately
        setTemplates(prev => prev.filter(t => t.id !== id));
        // Schedule actual delete with undo
        scheduleDelete({
            id,
            type: 'template',
            label: template.name || 'Template',
            data: template,
            deleteAction: () => deleteTemplateAction(id),
            onUndo: () => setTemplates(prev => [...prev, template]),
        });
    }

    const filtered = templates.filter(t => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
    });

    if (!isHydrated) return null;

    return (
        <div className="mailbox-wrapper">
            <Topbar
                searchTerm={searchQuery}
                setSearchTerm={setSearchQuery}
                onSearch={() => {}}
                onClearSearch={() => setSearchQuery('')}
                placeholder="Search templates..."
            />

            <div className="main-area" style={{ padding: '1.5rem', overflow: 'auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Templates</h1>
                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            Reusable email templates for campaigns and compose
                        </p>
                    </div>
                    <button
                        onClick={openCreateModal}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                            background: 'var(--accent)', color: '#fff', padding: '0.625rem 1.25rem',
                            borderRadius: 'var(--radius-full)', fontWeight: 500, fontSize: 'var(--text-sm)',
                            border: 'none', cursor: 'pointer',
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14m-7-7h14" />
                        </svg>
                        New Template
                    </button>
                </div>

                {/* Category Filter */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.value}
                            onClick={() => setFilterCategory(cat.value)}
                            style={{
                                padding: '0.375rem 0.875rem', borderRadius: 'var(--radius-full)',
                                border: '1px solid var(--border)', cursor: 'pointer',
                                fontSize: 'var(--text-xs)', fontWeight: 500,
                                background: filterCategory === cat.value ? 'var(--accent)' : 'var(--bg-surface)',
                                color: filterCategory === cat.value ? '#fff' : 'var(--text-secondary)',
                            }}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* Template Grid */}
                {isLoading ? (
                    <PageLoader isLoading={true}><div /></PageLoader>
                ) : filtered.length === 0 ? (
                    <div style={{
                        textAlign: 'center', padding: '4rem 2rem',
                        color: 'var(--text-secondary)', fontSize: 'var(--text-sm)',
                    }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', opacity: 0.5 }}>
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="3" y1="9" x2="21" y2="9" />
                            <line x1="9" y1="21" x2="9" y2="9" />
                        </svg>
                        <p style={{ fontWeight: 500, marginBottom: '0.25rem' }}>No templates yet</p>
                        <p>Create your first template to reuse content across campaigns.</p>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                        gap: '1rem',
                    }}>
                        {filtered.map(template => (
                            <div key={template.id} style={{
                                background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border)', padding: '1.25rem',
                                display: 'flex', flexDirection: 'column',
                                transition: 'border-color var(--duration-fast) var(--ease)',
                            }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                                            {template.name}
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                                            <span className={`badge badge-sm ${CATEGORY_COLORS[template.category] || 'badge-gray'}`}>
                                                {template.category.replace(/_/g, ' ')}
                                            </span>
                                            {template.is_shared && (
                                                <span className="badge badge-sm badge-blue">Shared</span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                        Used {template.usage_count}x
                                    </div>
                                </div>

                                <div style={{
                                    fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                                    marginBottom: '0.25rem', fontWeight: 500,
                                }}>
                                    Subject: {template.subject}
                                </div>

                                <div style={{
                                    fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
                                    flex: 1, overflow: 'hidden',
                                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                                    marginBottom: '0.75rem',
                                }}>
                                    {stripHtml(template.body).substring(0, 120)}
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                                    <button
                                        onClick={() => openEditModal(template)}
                                        style={{
                                            padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)',
                                            border: '1px solid var(--border)', background: 'var(--bg-surface)',
                                            cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                                        }}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(template.id)}
                                        style={{
                                            padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-full)',
                                            border: '1px solid var(--border)', background: 'var(--bg-surface)',
                                            cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--danger)',
                                        }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
                }}
                    onClick={() => setShowModal(false)}
                >
                    <div
                        style={{
                            background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                            width: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>
                                {editingTemplate ? 'Edit Template' : 'New Template'}
                            </h3>
                            <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {formError && (
                            <div style={{ padding: '0.5rem 1.25rem', background: '#fce8e6', color: '#c5221f', fontSize: 'var(--text-xs)' }}>
                                {formError}
                            </div>
                        )}

                        <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem' }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Name</label>
                                <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Template name"
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)', fontSize: 'var(--text-sm)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Category</label>
                                    <select value={formCategory} onChange={e => setFormCategory(e.target.value)}
                                        style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)', fontSize: 'var(--text-sm)', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                                        {CATEGORIES.filter(c => c.value !== 'ALL').map(c => (
                                            <option key={c.value} value={c.value}>{c.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.375rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                        <input type="checkbox" checked={formIsShared} onChange={e => setFormIsShared(e.target.checked)} />
                                        Shared with team
                                    </label>
                                </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Subject</label>
                                <input type="text" value={formSubject} onChange={e => setFormSubject(e.target.value)} placeholder="Email subject line"
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)', fontSize: 'var(--text-sm)', background: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>Body</label>
                                <textarea
                                    value={formBody}
                                    onChange={e => setFormBody(e.target.value)}
                                    placeholder="Email body content... Use {{first_name}}, {{company}} for personalization"
                                    rows={10}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border)', fontSize: 'var(--text-sm)', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit', outline: 'none', lineHeight: 1.6 }}
                                />
                            </div>
                        </div>

                        <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <button onClick={() => setShowModal(false)}
                                style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                                Cancel
                            </button>
                            <button onClick={handleSave} disabled={isSaving}
                                style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 500, opacity: isSaving ? 0.5 : 1 }}>
                                {isSaving ? 'Saving...' : editingTemplate ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
