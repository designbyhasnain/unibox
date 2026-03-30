'use client';

import React, { useState, useEffect } from 'react';
import { getTemplatesAction, incrementTemplateUsageAction, type TemplateData } from '../../src/actions/templateActions';

const CATEGORIES = [
    { value: 'ALL', label: 'All' },
    { value: 'COLD_OUTREACH', label: 'Cold Outreach' },
    { value: 'FOLLOW_UP', label: 'Follow Up' },
    { value: 'RETARGETING', label: 'Retargeting' },
    { value: 'GENERAL', label: 'General' },
    { value: 'PROJECT_UPDATE', label: 'Project Update' },
];

interface TemplatePickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (template: { subject: string; body: string }) => void;
    defaultCategory?: string;
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function TemplatePickerModal({
    isOpen,
    onClose,
    onSelect,
    defaultCategory,
}: TemplatePickerModalProps) {
    const [templates, setTemplates] = useState<TemplateData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState(defaultCategory || 'ALL');
    const [previewId, setPreviewId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            setSearch('');
            setPreviewId(null);
            if (defaultCategory) setCategory(defaultCategory);
            getTemplatesAction().then(data => {
                setTemplates(data);
                setIsLoading(false);
            });
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const filtered = templates.filter(t => {
        if (category !== 'ALL' && t.category !== category) return false;
        if (search) {
            const q = search.toLowerCase();
            return t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
        }
        return true;
    });

    const previewTemplate = previewId ? templates.find(t => t.id === previewId) : null;

    function handleSelect(template: TemplateData) {
        onSelect({ subject: template.subject, body: template.body });
        incrementTemplateUsageAction(template.id);
        onClose();
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                    width: previewTemplate ? '800px' : '500px', maxHeight: '80vh',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                    transition: 'width var(--duration-normal) var(--ease)',
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>Choose Template</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Search */}
                <div style={{ padding: '0.75rem 1.25rem' }}>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search templates..."
                        style={{
                            width: '100%', padding: '0.5rem 0.875rem', borderRadius: 'var(--radius-full)',
                            border: '1px solid var(--border)', fontSize: 'var(--text-sm)',
                            background: 'var(--bg-surface)', outline: 'none',
                        }}
                    />
                </div>

                {/* Category tabs */}
                <div style={{ display: 'flex', gap: '0.25rem', padding: '0 1.25rem 0.5rem', flexWrap: 'wrap' }}>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.value}
                            onClick={() => setCategory(cat.value)}
                            style={{
                                padding: '0.25rem 0.625rem', borderRadius: 'var(--radius-full)',
                                border: '1px solid var(--border)', cursor: 'pointer',
                                fontSize: '10px', fontWeight: 500,
                                background: category === cat.value ? 'var(--accent)' : 'transparent',
                                color: category === cat.value ? '#fff' : 'var(--text-secondary)',
                            }}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* Template list + optional preview */}
                <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
                    <div style={{ flex: 1, overflow: 'auto', padding: '0 1.25rem 1.25rem' }}>
                        {isLoading ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                                Loading templates...
                            </div>
                        ) : filtered.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                                No templates found
                            </div>
                        ) : filtered.map(template => (
                            <div
                                key={template.id}
                                style={{
                                    padding: '0.75rem', borderBottom: '1px solid var(--border)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    background: previewId === template.id ? 'var(--bg-hover)' : 'transparent',
                                    transition: 'background var(--duration-fast) var(--ease)',
                                }}
                                onClick={() => handleSelect(template)}
                                onMouseEnter={() => setPreviewId(template.id)}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: '0.125rem' }}>
                                        {template.name}
                                    </div>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                                        {template.subject}
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '0.125rem' }}>
                                        {stripHtml(template.body).substring(0, 60)}...
                                    </div>
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                                    {template.usage_count}x used
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Preview pane */}
                    {previewTemplate && (
                        <div style={{
                            width: '300px', borderLeft: '1px solid var(--border)',
                            padding: '1.25rem', overflow: 'auto', flexShrink: 0,
                        }}>
                            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                                Preview
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
                                Subject: {previewTemplate.subject}
                            </div>
                            <div
                                style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6 }}
                                dangerouslySetInnerHTML={{ __html: previewTemplate.body }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
