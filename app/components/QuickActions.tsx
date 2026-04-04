'use client';

import React, { useState, useEffect } from 'react';
import { getTemplatesAction } from '../../src/actions/templateActions';
import type { TemplateData } from '../../src/actions/templateActions';

type Props = {
    contactEmail: string;
    contactName: string;
    actionType: string;
    onSendWithTemplate: (template: { subject: string; body: string }) => void;
    onSendBlank: () => void;
    onClose: () => void;
};

const ACTION_TYPE_TO_CATEGORY: Record<string, string> = {
    NEW_LEAD: 'COLD_OUTREACH',
    FOLLOW_UP: 'FOLLOW_UP',
    WIN_BACK: 'RETARGETING',
};

export default function QuickActions({
    contactEmail,
    contactName,
    actionType,
    onSendWithTemplate,
    onSendBlank,
    onClose,
}: Props) {
    const [templates, setTemplates] = useState<TemplateData[]>([]);
    const [loading, setLoading] = useState(true);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    useEffect(() => {
        const category = ACTION_TYPE_TO_CATEGORY[actionType];
        getTemplatesAction(category)
            .then((data) => setTemplates(data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [actionType]);

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,.3)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'DM Sans', sans-serif",
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: '#fff',
                    borderRadius: 12,
                    padding: 24,
                    width: 480,
                    boxShadow: '0 20px 60px rgba(0,0,0,.15)',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                }}
            >
                {/* Header */}
                <div style={{ marginBottom: 20 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111' }}>
                        Email {contactName}
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>
                        {contactEmail}
                    </p>
                </div>

                {/* Write from scratch */}
                <button
                    onClick={onSendBlank}
                    style={{
                        width: '100%',
                        padding: '12px 16px',
                        background: '#f3f4f6',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#333',
                        fontFamily: "'DM Sans', sans-serif",
                        textAlign: 'left',
                        marginBottom: 24,
                    }}
                >
                    {'\u270F\uFE0F'} Write from scratch
                </button>

                {/* Suggested templates */}
                <div>
                    <p
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#999',
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            margin: '0 0 12px',
                        }}
                    >
                        Suggested Templates
                    </p>

                    {loading ? (
                        <p style={{ fontSize: 13, color: '#999', margin: 0 }}>Loading templates...</p>
                    ) : templates.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#999', margin: 0 }}>
                            No templates for this action type yet. Create them in Templates page.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {templates.map((tpl) => (
                                <div
                                    key={tpl.id}
                                    onClick={() =>
                                        onSendWithTemplate({ subject: tpl.subject, body: tpl.body })
                                    }
                                    onMouseEnter={() => setHoveredId(tpl.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    style={{
                                        padding: '12px 14px',
                                        border: `1px solid ${hoveredId === tpl.id ? '#3b82f6' : '#e5e7eb'}`,
                                        borderRadius: 8,
                                        cursor: 'pointer',
                                        transition: 'border-color 0.15s',
                                    }}
                                >
                                    <p
                                        style={{
                                            margin: 0,
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: '#111',
                                        }}
                                    >
                                        {tpl.name}
                                    </p>
                                    <p
                                        style={{
                                            margin: '4px 0 0',
                                            fontSize: 11,
                                            color: '#888',
                                        }}
                                    >
                                        {tpl.subject}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
