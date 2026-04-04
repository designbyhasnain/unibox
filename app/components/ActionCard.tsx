'use client';

import React from 'react';
import Link from 'next/link';
import type { ActionItem } from '../../src/actions/actionQueueActions';

const URGENCY_STYLES = {
    critical: { bg: '#fef2f2', border: '#dc2626', badge: '#dc2626', text: 'URGENT' },
    high: { bg: '#fffbeb', border: '#d97706', badge: '#d97706', text: 'HIGH' },
    medium: { bg: '#eff6ff', border: '#2563eb', badge: '#2563eb', text: 'MEDIUM' },
    low: { bg: '#f8fafc', border: '#94a3b8', badge: '#64748b', text: 'LOW' },
};

const ACTION_ICONS: Record<string, string> = {
    REPLY_NOW: '\uD83D\uDCE9',
    NEW_LEAD: '\uD83C\uDD95',
    FOLLOW_UP: '\uD83D\uDD04',
    WIN_BACK: '\uD83C\uDFAF',
    STALE: '\uD83D\uDCA4',
};

type Props = {
    action: ActionItem;
    onQuickEmail: (action: ActionItem) => void;
    onSnooze: (contactId: string, days: number) => void;
    onDone: (contactId: string) => void;
};

export default function ActionCard({ action, onQuickEmail, onSnooze, onDone }: Props) {
    const style = URGENCY_STYLES[action.urgency];
    const icon = ACTION_ICONS[action.actionType] || '\uD83D\uDCCB';

    return (
        <div style={{
            background: style.bg,
            borderLeft: `4px solid ${style.border}`,
            borderRadius: 8,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            transition: 'box-shadow .15s, transform .15s',
            cursor: 'default',
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.07)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
        >
            <span style={{ fontSize: 24, flexShrink: 0 }}>{icon}</span>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <Link href={`/clients/${action.contactId}`} style={{
                        fontSize: 14, fontWeight: 700, color: '#0f172a', textDecoration: 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {action.name}
                    </Link>
                    <span style={{
                        fontSize: 9, fontWeight: 700, background: style.badge, color: '#fff',
                        padding: '2px 8px', borderRadius: 4, letterSpacing: '.04em', flexShrink: 0,
                    }}>{style.text}</span>
                    {action.estimatedValue != null && action.estimatedValue > 0 && (
                        <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, flexShrink: 0 }}>
                            ${action.estimatedValue.toLocaleString()}
                        </span>
                    )}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {action.reason}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 12 }}>
                    <span>{action.email}</span>
                    {action.location && <span>{action.location}</span>}
                    {action.totalEmailsSent > 0 && <span>{action.totalEmailsSent} sent / {action.totalEmailsReceived} received</span>}
                </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => onQuickEmail(action)} style={{
                    background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
                    padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    transition: 'background .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1d4ed8')}
                onMouseLeave={e => (e.currentTarget.style.background = '#2563eb')}
                >
                    {action.actionType === 'REPLY_NOW' ? 'Reply' : 'Email'}
                </button>
                <button onClick={() => onSnooze(action.contactId, 3)} style={{
                    background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6,
                    padding: '6px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                }} title="Snooze 3 days">
                    {'\u23F0'} 3d
                </button>
                <button onClick={() => onDone(action.contactId)} style={{
                    background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6,
                    padding: '6px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
                }} title="Mark done">
                    {'\u2713'}
                </button>
            </div>
        </div>
    );
}
