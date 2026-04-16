'use client';

import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import Topbar from '../components/Topbar';
import { getRevenueOpportunitiesAction } from '../../src/actions/revenueActions';
import { generateAISummaryAction } from '../../src/actions/summaryActions';
import { useHydrated } from '../utils/useHydration';
import { PageLoader } from '../components/LoadingStates';
import { useUI } from '../context/UIContext';
import { avatarColor, initials } from '../utils/helpers';
import { useSWRData } from '../utils/staleWhileRevalidate';

export default function OpportunitiesPage() {
    const isHydrated = useHydrated();
    const { setComposeOpen, setComposeDefaultTo } = useUI();
    const [activeTab, setActiveTab] = useState<'waiting' | 'winback' | 'stale'>('waiting');
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [aiLoading, setAiLoading] = useState<string | null>(null);
    const [selectedContact, setSelectedContact] = useState<string | null>(null);

    const { data, isLoading, refresh: loadData } = useSWRData(
        'opportunities',
        () => getRevenueOpportunitiesAction()
    );

    const handleAIAudit = async (contactId: string) => {
        setAiLoading(contactId);
        setSelectedContact(contactId);
        setAiSummary(null);
        try {
            const result = await generateAISummaryAction(contactId);
            setAiSummary(result);
        } catch {
            setAiSummary('Failed to generate AI summary. Please try again.');
        } finally {
            setAiLoading(null);
        }
    };

    const handleReply = (email: string) => {
        setComposeDefaultTo(email);
        setComposeOpen(true);
    };

    const urgencyColors: Record<string, string> = { hot: '#EF4444', warm: '#F59E0B', cooling: '#3B82F6', cold: '#6B7280' };
    const urgencyLabels: Record<string, string> = { hot: 'TODAY', warm: '1-3 DAYS', cooling: '3-7 DAYS', cold: '7+ DAYS' };

    const renderContactRow = (contact: any, showUrgency = false) => (
        <div key={contact.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
            background: selectedContact === contact.id ? 'rgba(26,115,232,0.05)' : 'transparent',
        }} onClick={() => handleAIAudit(contact.id)}>
            <div className="avatar avatar-sm" style={{ background: avatarColor(contact.email || 'x'), flexShrink: 0 }}>
                {initials(contact.name || contact.email || '?')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {contact.name || contact.email}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{contact.email}</div>
            </div>
            {showUrgency && contact.urgency && (
                <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: urgencyColors[contact.urgency], color: '#fff',
                }}>{urgencyLabels[contact.urgency]}</span>
            )}
            {!showUrgency && (
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {contact.total_emails_received || 0} replies · {contact.days_since_last_contact || 0}d ago
                </span>
            )}
            <button className="btn btn-primary sm" style={{ height: 28, padding: '0 10px', fontSize: 11, flexShrink: 0 }}
                onClick={(e) => { e.stopPropagation(); handleReply(contact.email); }}>
                Reply
            </button>
        </div>
    );

    const tabs = [
        { key: 'waiting', label: 'Reply ASAP', count: data?.waitingCount || 0, color: '#EF4444' },
        { key: 'winback', label: 'Win Back', count: data?.winBackCount || 0, color: '#F59E0B' },
        { key: 'stale', label: 'Follow Up', count: data?.staleCount || 0, color: '#3B82F6' },
    ];

    const activeList = activeTab === 'waiting' ? data?.waitingForReply :
                       activeTab === 'winback' ? data?.winBackCandidates : data?.staleFollowUps;

    return (
        <div className="mailbox-wrapper">
            <div className="mailbox-main">
                <Topbar searchTerm="" setSearchTerm={() => {}} placeholder="Opportunities"
                    onSearch={() => {}} onClearSearch={() => {}}
                    leftContent={<h1 className="clients-page-title">Revenue Opportunities</h1>}
                    rightContent={
                        <button className="btn btn-secondary sm" onClick={loadData}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
                            Refresh
                        </button>
                    }
                />

                <div className="content-split content-split-bg">
                    <div className="list-panel list-panel-flex" style={{ maxWidth: '100%' }}>
                        <PageLoader isLoading={!isHydrated || isLoading} type="list" count={8}>
                            {data && (
                                <>
                                    {/* Revenue Estimate Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '16px 16px 0' }}>
                                        {[
                                            { label: 'Waiting for Reply', value: data.waitingCount, revenue: data.estimatedRevenue.waiting, color: '#EF4444', desc: 'Reply = instant deal' },
                                            { label: 'Win-Back Targets', value: data.winBackCount, revenue: data.estimatedRevenue.winBack, color: '#F59E0B', desc: '10% will convert' },
                                            { label: 'Need Follow-Up', value: data.staleCount, revenue: data.estimatedRevenue.stale, color: '#3B82F6', desc: '5% will convert' },
                                        ].map(card => (
                                            <div key={card.label} style={{
                                                background: 'var(--bg-secondary)', borderRadius: 12, padding: '16px',
                                                border: '1px solid var(--border-subtle)',
                                            }}>
                                                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>{card.label}</div>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                                    <span style={{ fontSize: 28, fontWeight: 700, color: card.color }}>{card.value}</span>
                                                    <span style={{ fontSize: 13, color: '#10B981', fontWeight: 600 }}>${card.revenue.toLocaleString()}</span>
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{card.desc}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Total */}
                                    <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#10B981' }}>
                                            Estimated Revenue Opportunity: ${(data.estimatedRevenue.waiting + data.estimatedRevenue.winBack + data.estimatedRevenue.stale).toLocaleString()}
                                        </span>
                                    </div>

                                    {/* Tabs */}
                                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', padding: '0 16px' }}>
                                        {tabs.map(tab => (
                                            <button key={tab.key}
                                                onClick={() => { setActiveTab(tab.key as any); setAiSummary(null); setSelectedContact(null); }}
                                                style={{
                                                    padding: '10px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                    border: 'none', background: 'transparent',
                                                    color: activeTab === tab.key ? tab.color : 'var(--text-tertiary)',
                                                    borderBottom: activeTab === tab.key ? `2px solid ${tab.color}` : '2px solid transparent',
                                                }}>
                                                {tab.label} <span style={{ fontSize: 11, opacity: 0.7 }}>({tab.count})</span>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Split: List + AI Panel */}
                                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                                        {/* Contact List */}
                                        <div style={{ flex: 1, overflowY: 'auto', borderRight: aiSummary || aiLoading ? '1px solid var(--border-subtle)' : 'none' }}>
                                            {(activeList || []).length === 0 ? (
                                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                                    No contacts in this category
                                                </div>
                                            ) : (
                                                (activeList || []).map((c: any) => renderContactRow(c, activeTab === 'waiting'))
                                            )}
                                        </div>

                                        {/* AI Summary Panel */}
                                        {(aiSummary || aiLoading) && (
                                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', maxHeight: 'calc(100vh - 300px)' }}>
                                                {aiLoading ? (
                                                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>
                                                        <div style={{ fontSize: 14, marginBottom: 8 }}>AI analyzing relationship...</div>
                                                        <div style={{ fontSize: 12 }}>Reading emails and generating insights</div>
                                                    </div>
                                                ) : aiSummary ? (
                                                    <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-primary)' }}>
                                                        {aiSummary.split('\n').map((line, i) => {
                                                            const t = line.trim();
                                                            if (!t) return <div key={i} style={{ height: 8 }} />;
                                                            if (t.startsWith('## ')) return <h3 key={i} style={{ fontSize: 16, fontWeight: 700, margin: '20px 0 8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 6 }}>{t.slice(3)}</h3>;
                                                            if (t.startsWith('### ')) return <h4 key={i} style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 6px', color: '#1a73e8' }}>{t.slice(4)}</h4>;
                                                            if (t.startsWith('- ') || t.startsWith('* ')) {
                                                                const text = DOMPurify.sanitize(t.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'), { ALLOWED_TAGS: ['strong', 'em'] });
                                                                return <div key={i} style={{ paddingLeft: 16, margin: '4px 0', position: 'relative' }}><span style={{ position: 'absolute', left: 4 }}>•</span><span dangerouslySetInnerHTML={{ __html: text }} /></div>;
                                                            }
                                                            if (t.startsWith('Subject:') || t.startsWith('Dear ') || t.startsWith('Hi ') || t.startsWith('Hey ')) {
                                                                return <div key={i} style={{ padding: '4px 12px', background: 'rgba(26,115,232,0.04)', borderLeft: '2px solid #1a73e8', margin: '2px 0', fontStyle: 'italic' }}>{t}</div>;
                                                            }
                                                            const html = DOMPurify.sanitize(t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/"([^"]+)"/g, '<span style="color:#1a73e8">"$1"</span>'), { ALLOWED_TAGS: ['strong', 'em', 'span'], ALLOWED_ATTR: ['style'] });
                                                            return <p key={i} style={{ margin: '4px 0' }} dangerouslySetInnerHTML={{ __html: html }} />;
                                                        })}
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </PageLoader>
                    </div>
                </div>
            </div>
        </div>
    );
}
