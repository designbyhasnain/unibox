'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useUI } from './context/UIContext';
import InlineReply from './components/InlineReply';
import JarvisSuggestionBox from './components/JarvisSuggestionBox';
import { ThreadMessages, ToastStack } from './components/InboxComponents';
import Resizer from './components/Resizer';
import { PageLoader } from './components/LoadingStates';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
    updateEmailStageAction,
    markAsNotInterestedAction,
    bulkUpdateStageAction,
    bulkMarkReadAction,
    bulkMarkUnreadAction,
} from '../src/actions/emailActions';
import { useMailbox, isNoiseEmail } from './hooks/useMailbox';
import { useGlobalFilter } from './context/FilterContext';
import { useRegisterGlobalSearch } from './context/GlobalSearchContext';
import { STAGE_OPTIONS } from './constants/stages';
import { useHydrated } from './utils/useHydration';
import { formatDate, cleanPreview } from './utils/helpers';
import { getAvatarSrc, getAvatarBg } from './utils/avatars';
import { RefreshCw, Mail, Send, Trash2, Eye, EyeOff, CheckCheck } from 'lucide-react';
import ClientIntelligencePanel from './components/ClientIntelligencePanel';
import OwnerPicker from './components/OwnerPicker';
import { getClientIntelligenceAction } from '../src/actions/clientIntelligenceAction';
import type { ClientIntelligenceProfile } from '../src/types/clientIntelligence';

const PAGE_SIZE = 50;

const ICONS = {
    inbox: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-6l-2 3H10l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
    sent: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    filter: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    refresh: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
    chevLeft: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>,
    chevRight: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>,
    search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
    eye: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    flag: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
    archive: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
    trash: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
    more: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>,
    spark: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L9 12l-7 0 5.5 5L5 22l7-4.5L19 22l-2.5-5L22 12h-7L12 2z"/></svg>,
    reply: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 17L4 12l5-5M4 12h16"/></svg>,
    forward: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 17l5-5-5-5M20 12H4"/></svg>,
    copy: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
    thumbUp: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>,
    thumbDown: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>,
    attach: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
    template: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
    clock: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
};

const stageLabel = (s: string) => {
    const map: Record<string, string> = { COLD_LEAD: 'Cold', CONTACTED: 'Contacted', WARM_LEAD: 'Warm', LEAD: 'Lead', OFFER_ACCEPTED: 'Offer', CLOSED: 'Closed', NOT_INTERESTED: 'Dead' };
    return map[s] || s;
};

const stageClass = (s: string) => {
    const map: Record<string, string> = { COLD_LEAD: 'cold', CONTACTED: 'contacted', WARM_LEAD: 'warm', LEAD: 'lead', OFFER_ACCEPTED: 'closed', CLOSED: 'closed', NOT_INTERESTED: 'dead' };
    return map[s] || 'cold';
};

interface ToastItem { id: string; subject: string; from: string; }

function extractSenderName(rawFrom: string): string {
    const parts = (rawFrom || '').split('<');
    const name = (parts[0] ?? '').trim().replace(/"/g, '');
    if (name && name !== rawFrom) return name;
    const emailParts = (rawFrom || '').split('@');
    return (emailParts[0] ?? '') || 'Unknown';
}

export default function InboxPage() {
    const isHydrated = useHydrated();
    const { selectedAccountId, setSelectedAccountId, accounts } = useGlobalFilter();

    const [activeTab, setActiveTab] = useState<'inbox' | 'sent'>('inbox');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchResults, setIsSearchResults] = useState(false);

    const mailboxType = isSearchResults ? 'search' : activeTab === 'sent' ? 'sent' : 'inbox';

    const {
        emails,
        totalCount,
        totalPages,
        currentPage,
        isLoading,
        selectedEmail,
        threadMessages,
        isThreadLoading,
        selectedEmailIds,
        isSyncing,
        setSelectedEmail,
        setCurrentPage,
        loadEmails,
        handleSync,
        handleSelectEmail,
        toggleSelectAll,
        handleBulkDelete,
        prefetchThread,
        isIdle,
        handleResume,
        appendThreadMessage,
        removeThreadMessage,
    } = useMailbox({
        type: mailboxType,
        activeStage: 'ALL',
        searchTerm,
        selectedAccountId,
        enabled: !isSearchResults || !!searchTerm,
        accounts
    });

    const { setComposeOpen, setComposeDefaultTo, setComposeDefaultSubject, setComposeDefaultBody } = useUI();
    const [isReplyingInline, setIsReplyingInline] = useState(false);
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [jarvisDraft, setJarvisDraft] = useState<string>('');
    const [jarvisDraftVersion, setJarvisDraftVersion] = useState(0);
    const [jarvisMode, setJarvisMode] = useState<'auto' | 'reply' | 'coach'>('auto');
    const [replyMode, setReplyMode] = useState<'reply' | 'fwd'>('reply');
    const [col3Tab, setCol3Tab] = useState<'jarvis' | 'client'>('jarvis');
    const [clientProfile, setClientProfile] = useState<ClientIntelligenceProfile | null>(null);
    const [clientProfileLoading, setClientProfileLoading] = useState(false);
    // Optimistic override of an inbox row's account-manager display after a transfer,
    // so the UI updates immediately without waiting for an inbox refetch. Keyed by contact_id.
    const [ownerOverrides, setOwnerOverrides] = useState<Record<string, { id: string | null; name: string | null }>>({});
    const [ownerPickerOpenFor, setOwnerPickerOpenFor] = useState<string | null>(null);

    // Reset reply state whenever a different thread is opened
    useEffect(() => {
        setJarvisDraft('');
        setIsReplyingInline(false);
    }, [selectedEmail?.id]);

    // Fetch client intelligence profile when a thread with a known contact is selected
    useEffect(() => {
        if (!selectedEmail?.contact_id) {
            setClientProfile(null);
            return;
        }
        let cancelled = false;
        setClientProfileLoading(true);
        const contactEmail = selectedEmail.direction === 'RECEIVED'
            ? (selectedEmail.from_email?.match(/<([^>]+)>/)?.[1] ?? selectedEmail.from_email ?? null)
            : (selectedEmail.to_email?.split(',')[0]?.match(/<([^>]+)>/)?.[1] ?? selectedEmail.to_email?.split(',')[0] ?? null);
        getClientIntelligenceAction(selectedEmail.contact_id, contactEmail).then(result => {
            if (cancelled) return;
            setClientProfileLoading(false);
            if (result.success) setClientProfile(result.data);
            else setClientProfile(null);
        });
        return () => { cancelled = true; };
    }, [selectedEmail?.contact_id]);

    const handleCopyJarvisDraft = useCallback((text: string) => {
        setJarvisDraft(text);
        setJarvisDraftVersion(v => v + 1);
        setIsReplyingInline(true);
    }, []);

    const handleBulkStageChange = async (stage: string) => {
        if (selectedEmailIds.size === 0) return;
        setBulkLoading(true);
        try {
            const contactIds = emails
                .filter((e: any) => selectedEmailIds.has(e.id) && e.contact_id)
                .map((e: any) => e.contact_id);
            const unique = [...new Set(contactIds)];
            if (unique.length > 0) {
                await bulkUpdateStageAction(unique, stage);
            }
            loadEmails(currentPage);
        } catch (e) { console.error('Bulk stage change failed:', e); }
        setBulkLoading(false);
    };

    const handleBulkRead = async () => {
        if (selectedEmailIds.size === 0) return;
        setBulkLoading(true);
        try {
            await bulkMarkReadAction([...selectedEmailIds]);
            loadEmails(currentPage);
        } catch (e) { console.error('Bulk mark read failed:', e); }
        setBulkLoading(false);
    };

    const handleBulkUnread = async () => {
        if (selectedEmailIds.size === 0) return;
        setBulkLoading(true);
        try {
            await bulkMarkUnreadAction([...selectedEmailIds]);
            loadEmails(currentPage);
        } catch (e) { console.error('Bulk mark unread failed:', e); }
        setBulkLoading(false);
    };

    const [pollingInterval, setPollingInterval] = useState(300);
    const [isPollingEnabled, setIsPollingEnabled] = useState(true);

    useEffect(() => {
        try {
            const pi = localStorage.getItem('settings_polling_interval');
            if (pi) setPollingInterval(parseInt(pi, 10));
            const pe = localStorage.getItem('settings_polling_enabled');
            if (pe !== null) setIsPollingEnabled(pe === 'true');
        } catch {}
    }, []);

    const toastTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
    const handleSyncRef = useRef(handleSync);

    useEffect(() => {
        handleSyncRef.current = handleSync;
    }, [handleSync]);

    useEffect(() => {
        return () => {
            toastTimerRef.current.forEach((timer) => clearTimeout(timer));
            toastTimerRef.current.clear();
        };
    }, []);

    useEffect(() => {
        if (!searchTerm.trim()) {
            setIsSearchResults(false);
        } else {
            setIsSearchResults(true);
            setSelectedEmail(null);
        }
    }, [searchTerm]);

    useRegisterGlobalSearch('/', {
        placeholder: 'Search mail',
        value: searchTerm,
        onChange: setSearchTerm,
        onClear: () => setSearchTerm(''),
    });

    const isLive = isHydrated && accounts.length > 0;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setSelectedEmail(null);
            if (e.key === 'c' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName === 'BODY') {
                setComposeDefaultTo('');
                setComposeDefaultSubject('');
                setComposeDefaultBody('');
                setComposeOpen(true);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [setSelectedEmail]);

    useEffect(() => {
        const handleNavReset = () => {
            setSelectedEmail(null);
            setSearchTerm('');
            setIsSearchResults(false);
        };
        window.addEventListener('nav-reset', handleNavReset);
        return () => window.removeEventListener('nav-reset', handleNavReset);
    }, [setSelectedEmail]);

    useEffect(() => {
        if (!isPollingEnabled || activeTab !== 'inbox') return;
        const intervalMs = pollingInterval * 1000;
        const id = setInterval(() => {
            handleSyncRef.current();
        }, intervalMs);
        return () => clearInterval(id);
    }, [isPollingEnabled, pollingInterval, activeTab]);

    const goToPage = (page: number) => {
        setCurrentPage(page);
        loadEmails(page);
        const el = document.getElementById('email-list-scroll');
        if (el) el.scrollTop = 0;
    };

    const handleChangeStage = async (messageId: string, newStage: string) => {
        try {
            await updateEmailStageAction(messageId, newStage);
            loadEmails(currentPage);
        } catch (err) {
            console.error('Stage change failed:', err);
            const toastId = `error-${Date.now()}`;
            setToasts(prev => [...prev, { id: toastId, subject: 'Failed to change stage', from: 'Please try again' }]);
            const timer = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 4000);
            toastTimerRef.current.set(toastId, timer);
        }
    };

    const handleNotInterested = async (senderEmail: string) => {
        if (!senderEmail) return;
        try {
            await markAsNotInterestedAction(senderEmail);
            loadEmails(currentPage);
        } catch (err) {
            console.error('Mark not interested failed:', err);
            const toastId = `error-${Date.now()}`;
            setToasts(prev => [...prev, { id: toastId, subject: 'Failed to mark as not interested', from: 'Please try again' }]);
            const timer = setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 4000);
            toastTimerRef.current.set(toastId, timer);
        }
    };

    const dismissToast = (toastId: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
        const timer = toastTimerRef.current.get(toastId);
        if (timer) clearTimeout(timer);
        toastTimerRef.current.delete(toastId);
    };

    const handleTabSwitch = (tab: 'inbox' | 'sent') => {
        setActiveTab(tab);
        setSelectedEmail(null);
        setSearchTerm('');
        setIsSearchResults(false);
    };

    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (activeTab === 'inbox' && !isSearchResults && isHydrated) {
            setUnreadCount(emails.filter((e: any) => e.is_unread).length);
        }
    }, [emails, activeTab, isSearchResults, isHydrated]);

    const hasEmail = !!selectedEmail;

    return (
        <div className="inbox-page">
            <ToastStack toasts={toasts} onDismiss={dismissToast} />

            {isIdle && (
                <div className="inbox-idle-banner" role="alert">
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    <span>Sync paused due to inactivity</span>
                    <button className="inbox-idle-resume" onClick={handleResume}>Resume</button>
                </div>
            )}

            {/* 3-Column Grid */}
            <div className={`inbox-grid ${hasEmail ? '' : 'no-jarvis'}`}>

                {/* ═══ Column 1: Email List ═══ */}
                <div className="col col-list">
                    <div className="col-head">
                        <div className="tabs">
                            <button
                                className={activeTab === 'inbox' && !isSearchResults ? 'active' : ''}
                                onClick={() => handleTabSwitch('inbox')}
                            >
                                {ICONS.inbox} Inbox
                                {unreadCount > 0 && <span className="mini-badge">{unreadCount > 999 ? '999+' : unreadCount}</span>}
                            </button>
                            <button
                                className={activeTab === 'sent' && !isSearchResults ? 'active' : ''}
                                onClick={() => handleTabSwitch('sent')}
                            >
                                {ICONS.sent} Sent
                            </button>
                            {isSearchResults && (
                                <button className="active">
                                    {ICONS.search} Results
                                </button>
                            )}
                        </div>
                        <div style={{ flex: 1 }} />
                        {isSyncing && (
                            <span className="inbox-sync-msg">
                                <RefreshCw size={12} className="inbox-sync-spin" />
                            </span>
                        )}
                        <div className="inbox-status">
                            <div className={`inbox-status-dot ${isLive ? 'live' : ''}`} />
                        </div>
                        <button className="icon-btn" onClick={handleSync} disabled={isSyncing} title="Refresh">{ICONS.refresh}</button>
                    </div>

                    {/* Toolbar row */}
                    <div className="list-toolbar">
                        <label className="list-toolbar-check">
                            <input
                                type="checkbox"
                                checked={selectedEmailIds.size > 0 && selectedEmailIds.size === emails.length}
                                onChange={toggleSelectAll}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            <span>Select all</span>
                        </label>

                        {/* Bulk actions inline */}
                        {selectedEmailIds.size > 0 && (
                            <div className="list-bulk-actions">
                                <span className="list-bulk-count">{selectedEmailIds.size}</span>
                                {activeTab === 'inbox' && (
                                    <select
                                        className="list-bulk-select"
                                        onChange={(e) => { if (e.target.value) handleBulkStageChange(e.target.value); e.target.value = ''; }}
                                        defaultValue=""
                                        disabled={bulkLoading}
                                    >
                                        <option value="" disabled>Move...</option>
                                        {STAGE_OPTIONS.map((s: any) => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                )}
                                <button className="icon-btn" onClick={handleBulkRead} disabled={bulkLoading} title="Mark read"><Eye size={13} /></button>
                                <button className="icon-btn" onClick={handleBulkUnread} disabled={bulkLoading} title="Mark unread"><EyeOff size={13} /></button>
                                <button className="icon-btn" onClick={() => handleBulkDelete?.()} disabled={bulkLoading} title="Delete"><Trash2 size={13} /></button>
                            </div>
                        )}

                        <div className="list-toolbar-right">
                            {isHydrated && totalCount > 0 && (
                                <span className="num">{(currentPage - 1) * PAGE_SIZE + 1}&ndash;{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}</span>
                            )}
                            <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => goToPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>{ICONS.chevLeft}</button>
                            <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => goToPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages}>{ICONS.chevRight}</button>
                        </div>
                    </div>

                    {/* Email list */}
                    <div id="email-list-scroll" className="list-scroll">
                        <PageLoader isLoading={!isHydrated || isLoading} type="list" count={PAGE_SIZE} context={activeTab === 'sent' ? 'sent' : 'inbox'}>
                            {emails.length === 0 ? (
                                <div className="inbox-empty">
                                    <div className="inbox-empty-icon">
                                        {activeTab === 'sent' ? <Send size={24} color="var(--ink-faint)" /> : <Mail size={24} color="var(--ink-faint)" />}
                                    </div>
                                    <div className="inbox-empty-title">
                                        {isSearchResults ? 'No results found' : activeTab === 'sent' ? 'No sent mail' : 'All caught up'}
                                    </div>
                                    <div className="inbox-empty-desc">
                                        {isSearchResults
                                            ? `No messages matching \u201c${searchTerm}\u201d`
                                            : activeTab === 'sent'
                                            ? 'Emails you send will appear here.'
                                            : 'New messages will appear here.'}
                                    </div>
                                    {selectedAccountId !== 'ALL' && !isSearchResults && (
                                        <button className="inbox-empty-btn" onClick={() => setSelectedAccountId('ALL')}>
                                            Show all accounts
                                        </button>
                                    )}
                                </div>
                            ) : (
                                emails.filter((e: any) => !isNoiseEmail(e)).map((email: any) => {
                                    const isSelected = selectedEmail?.id === email.id;
                                    const isUnread = email.is_unread;
                                    const isSent = email.direction === 'SENT';
                                    let senderName = 'Unknown';
                                    if (isSent) {
                                        const toRaw = email.to_email || '';
                                        const toNameMatch = toRaw.split(',')[0]?.match(/^([^<]+)</);
                                        const toName = toNameMatch ? toNameMatch[1]?.trim().replace(/"/g, '') : toRaw.split('@')[0];
                                        senderName = toName || 'Unknown';
                                    } else {
                                        senderName = extractSenderName(email.from_email || '');
                                    }
                                    const preview = cleanPreview(email.snippet || email.body || '');
                                    const subject = email.subject || '(no subject)';
                                    const stage = email.pipeline_stage;
                                    const accountEmail = email.gmail_accounts?.email || '';
                                    const accountDisplayName: string = email.account_display_name || '';
                                    const accountProfileImage: string = email.account_profile_image || '';
                                    const amName: string | null = email.account_manager_name || null;
                                    const amEmail: string = email.account_manager_email || '';
                                    const amFirst = amName ? amName.trim().split(/\s+/)[0] : null;
                                    const amLabel = amFirst || (email.contact_id ? 'Unassigned' : '—');
                                    const dateStr = formatDate(email.sent_at);
                                    const initials = senderName.charAt(0).toUpperCase();

                                    return (
                                        <div
                                            key={email.id}
                                            className={`email-row ${isSelected ? 'selected' : ''} ${isUnread ? 'unread' : ''}`}
                                            onClick={() => handleSelectEmail(email)}
                                            onMouseEnter={() => prefetchThread?.(email.thread_id)}
                                        >
                                            {isSent && accountProfileImage ? (
                                                <div className="avatar" style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                                                    <img src={accountProfileImage} alt={accountDisplayName || accountEmail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                                                </div>
                                            ) : (
                                                <div className="avatar" style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: getAvatarBg(senderName) }}>
                                                    <img src={getAvatarSrc(senderName)} alt={initials} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                </div>
                                            )}
                                            <div className="body">
                                                <div className="top">
                                                    {isUnread && <span className="unread-dot" />}
                                                    <span className="sender">
                                                        {isSent ? `To: ${senderName}` : senderName}
                                                    </span>
                                                    <span className="time">
                                                        {isSent && (
                                                            <span style={{ marginRight: 4, display: 'inline-flex', verticalAlign: 'middle' }}>
                                                                <CheckCheck size={13} color={email.opened_at ? 'var(--accent)' : 'var(--ink-faint)'} strokeWidth={email.opened_at ? 3 : 2} />
                                                            </span>
                                                        )}
                                                        {dateStr}
                                                    </span>
                                                </div>
                                                <div className="subject">{subject}</div>
                                                <div className="preview">{preview}</div>
                                                <div className="meta">
                                                    {stage && (
                                                        <span className={`chip dot ${stageClass(stage)}`}>{stageLabel(stage)}</span>
                                                    )}
                                                    <span
                                                        style={{ marginLeft: 'auto', color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
                                                        title={amName ? `${amName}${amEmail ? ` <${amEmail}>` : ''}` : amLabel}
                                                    >
                                                        {accountProfileImage && (
                                                            <img src={accountProfileImage} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} referrerPolicy="no-referrer" />
                                                        )}
                                                        {accountDisplayName || accountEmail.split('@')[0]}
                                                        {amFirst && <span style={{ opacity: 0.7 }}>{' '}· {amFirst}</span>}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </PageLoader>
                    </div>
                </div>

                {/* Resizer: list ↔ thread */}
                {hasEmail && (
                    <Resizer varName="--list-w" storageKey="unibox:list-w" min={280} max={560} defaultVal={380} />
                )}

                {/* ═══ Column 2: Thread View ═══ */}
                {hasEmail && (
                    <div className="col col-thread">
                        <div className="col-head">
                            <button className="icon-btn" onClick={() => setSelectedEmail(null)} title="Back">{ICONS.chevLeft}</button>
                            <span className="title" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {selectedEmail.subject || '(No Subject)'}
                            </span>
                            <button className="icon-btn" title="Mark unread">{ICONS.eye}</button>
                            <button className="icon-btn" title="Flag">{ICONS.flag}</button>
                            <button className="icon-btn" title="Archive">{ICONS.archive}</button>
                            <button className="icon-btn" title="Delete" onClick={async () => {
                                if (window.confirm('Delete this email?')) {
                                    const { deleteEmailAction } = await import('../src/actions/emailActions');
                                    await deleteEmailAction(selectedEmail.id);
                                    setSelectedEmail(null);
                                }
                            }}>{ICONS.trash}</button>
                            {activeTab === 'inbox' && selectedEmail.pipeline_stage !== 'NOT_INTERESTED' && (
                                <button className="icon-btn" title="Not interested" onClick={() => {
                                    const email = selectedEmail.from_email?.match(/<([^>]+)>/)?.[1] || selectedEmail.from_email;
                                    if (email) handleNotInterested(email);
                                }}>{ICONS.more}</button>
                            )}
                        </div>

                        <div className="thread">
                            <h2>{selectedEmail.subject || '(No Subject)'}</h2>
                            <div className="thread-meta">
                                <span className={`chip dot ${stageClass(selectedEmail.pipeline_stage || 'COLD_LEAD')}`}>
                                    Stage · {stageLabel(selectedEmail.pipeline_stage || 'COLD_LEAD')}
                                </span>
                                <span>·</span>
                                <span>{threadMessages.length || 1} messages</span>
                                <span>·</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    {selectedEmail.account_profile_image && (
                                        <img src={selectedEmail.account_profile_image} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} referrerPolicy="no-referrer" />
                                    )}
                                    {selectedEmail.account_display_name || selectedEmail.gmail_accounts?.email || ''}
                                </span>
                                {selectedEmail.account_manager_name && (
                                    <>
                                        <span>·</span>
                                        <span title={`${selectedEmail.account_manager_name}${selectedEmail.account_manager_email ? ` <${selectedEmail.account_manager_email}>` : ''}`}>
                                            {selectedEmail.account_manager_name.trim().split(/\s+/)[0]}
                                        </span>
                                    </>
                                )}
                            </div>

                            <ErrorBoundary section="Thread Messages">
                                <ThreadMessages
                                    threadMessages={threadMessages}
                                    isThreadLoading={isThreadLoading}
                                    emailId={selectedEmail.id}
                                />
                            </ErrorBoundary>

                            {/* Reply composer — matches design .reply structure */}
                            <div className="reply">
                                <div className="reply-tabs">
                                    <button
                                        className={!isReplyingInline || replyMode === 'reply' ? 'active' : ''}
                                        onClick={() => { setReplyMode('reply'); setIsReplyingInline(true); }}
                                    >
                                        {ICONS.reply} Reply
                                    </button>
                                    <button
                                        className={replyMode === 'fwd' ? 'active' : ''}
                                        onClick={() => {
                                            setComposeDefaultTo('');
                                            setComposeDefaultSubject('Fwd: ' + (selectedEmail.subject || ''));
                                            const fwdBody = `<br/><br/>---------- Forwarded message ----------<br/>From: ${selectedEmail.from_email || ''}<br/>Date: ${new Date(selectedEmail.sent_at).toLocaleString()}<br/>Subject: ${selectedEmail.subject || ''}<br/>To: ${selectedEmail.to_email || ''}<br/><br/>${selectedEmail.body || selectedEmail.snippet || ''}`;
                                            setComposeDefaultBody(fwdBody);
                                            setComposeOpen(true);
                                        }}
                                    >
                                        {ICONS.forward} Forward
                                    </button>
                                    <div style={{ flex: 1 }} />
                                    {jarvisDraft && (
                                        <button
                                            className="reply-jarvis-btn"
                                            onClick={() => { setIsReplyingInline(true); }}
                                        >
                                            {ICONS.spark} Use Jarvis draft
                                        </button>
                                    )}
                                </div>
                                {isReplyingInline ? (
                                    <InlineReply
                                        threadId={selectedEmail.thread_id}
                                        to={selectedEmail.direction === 'SENT'
                                            ? selectedEmail.to_email
                                            : selectedEmail.from_email?.match(/<([^>]+)>/)?.[1] || selectedEmail.from_email}
                                        subject={selectedEmail.subject}
                                        accountId={selectedEmail.gmail_account_id}
                                        onOptimisticAppend={appendThreadMessage}
                                        onOptimisticRollback={removeThreadMessage}
                                        initialBody={jarvisDraft}
                                        initialBodyKey={jarvisDraftVersion}
                                        onSuccess={() => setIsReplyingInline(false)}
                                        onCancel={() => setIsReplyingInline(false)}
                                    />
                                ) : (
                                    <>
                                        <textarea
                                            placeholder={`Reply to ${extractSenderName(selectedEmail.from_email || '')}…   (⌘↵ to send)`}
                                            onClick={() => setIsReplyingInline(true)}
                                            readOnly
                                        />
                                        <div className="reply-foot">
                                            <button className="icon-btn">{ICONS.attach}</button>
                                            <button className="icon-btn">{ICONS.template}</button>
                                            <button className="icon-btn">{ICONS.clock}</button>
                                            <button className="icon-btn">{ICONS.spark}</button>
                                            <div style={{ flex: 1 }} />
                                            <button className="btn btn-ghost">Save draft</button>
                                            <button className="btn btn-primary" onClick={() => setIsReplyingInline(true)}>
                                                {ICONS.sent} Send
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Resizer: thread ↔ jarvis */}
                {hasEmail && (
                    <Resizer varName="--jar-w" storageKey="unibox:jar-w" min={280} max={520} defaultVal={340} invert />
                )}

                {/* ═══ Column 3: Jarvis / Client Panel ═══ */}
                {hasEmail && (
                    <div className="col col-jarvis">
                        <div className="col-head">
                            <span style={{ color: 'var(--accent-ink)', display: 'inline-flex' }}>{ICONS.spark}</span>
                            <span className="title">{col3Tab === 'client' ? 'Client' : 'Jarvis'}</span>
                            <div className="tabs" style={{ marginLeft: 'auto' }}>
                                {col3Tab === 'jarvis' && (
                                    <>
                                        <button className={jarvisMode === 'auto' ? 'active' : ''} onClick={() => setJarvisMode('auto')} title="Auto: pick reply or coach based on the latest message">Auto</button>
                                        <button className={jarvisMode === 'reply' ? 'active' : ''} onClick={() => setJarvisMode('reply')} title="Force draft-a-reply">Reply</button>
                                        <button className={jarvisMode === 'coach' ? 'active' : ''} onClick={() => setJarvisMode('coach')} title="Force coaching feedback on our most recent SENT">Coach</button>
                                        <span className="col-head-divider" />
                                    </>
                                )}
                                <button className={col3Tab === 'jarvis' ? 'active' : ''} onClick={() => setCol3Tab('jarvis')}>{ICONS.spark}</button>
                                <button className={col3Tab === 'client' ? 'active' : ''} onClick={() => setCol3Tab('client')}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                </button>
                            </div>
                        </div>

                        {col3Tab === 'jarvis' && (
                            <div className="jarvis-panel">
                                {selectedEmail.thread_id && (
                                    <JarvisSuggestionBox
                                        threadId={selectedEmail.thread_id}
                                        forceMode={jarvisMode === 'auto' ? null : jarvisMode}
                                        onCopy={handleCopyJarvisDraft}
                                    />
                                )}

                                {/* Relationship sub-card */}
                                <div className="sub-card">
                                    <h4>Relationship</h4>
                                    <div className="stage-bar">
                                        {['COLD_LEAD', 'CONTACTED', 'WARM_LEAD', 'LEAD', 'OFFER_ACCEPTED', 'CLOSED'].map((s) => (
                                            <button
                                                key={s}
                                                className={selectedEmail.pipeline_stage === s ? 'active' : ''}
                                                onClick={() => handleChangeStage(selectedEmail.id, s)}
                                            >
                                                {stageLabel(s)}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="kv"><span className="k">Account</span><span className="v">{selectedEmail.gmail_accounts?.email || 'Unknown'}</span></div>
                                    <div className="kv">
                                        <span className="k">Manager</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {(() => {
                                                const override = selectedEmail.contact_id ? ownerOverrides[selectedEmail.contact_id] : null;
                                                const displayName = override?.name ?? selectedEmail.account_manager_name;
                                                const tooltip = displayName ? `${displayName}${selectedEmail.account_manager_email ? ` <${selectedEmail.account_manager_email}>` : ''}` : 'Unassigned';
                                                return (
                                                    <span className="v" title={tooltip} style={displayName ? undefined : { fontStyle: 'italic', opacity: 0.7 }}>
                                                        {displayName ? displayName.trim().split(/\s+/)[0] : 'Unassigned'}
                                                    </span>
                                                );
                                            })()}
                                            {selectedEmail.contact_id && (
                                                <button
                                                    onClick={() => setOwnerPickerOpenFor(prev => prev === selectedEmail.contact_id ? null : selectedEmail.contact_id)}
                                                    title="Reassign this contact to a different account manager"
                                                    style={{
                                                        background: 'none',
                                                        border: '1px solid var(--hairline)',
                                                        cursor: 'pointer',
                                                        color: 'var(--ink-muted)',
                                                        fontSize: 10,
                                                        padding: '1px 6px',
                                                        borderRadius: 4,
                                                        lineHeight: 1.4,
                                                    }}
                                                >
                                                    {ownerPickerOpenFor === selectedEmail.contact_id ? 'Cancel' : 'Change'}
                                                </button>
                                            )}
                                        </span>
                                    </div>
                                    {selectedEmail.contact_id && ownerPickerOpenFor === selectedEmail.contact_id && (
                                        <OwnerPicker
                                            contactId={selectedEmail.contact_id}
                                            currentOwnerId={ownerOverrides[selectedEmail.contact_id]?.id ?? selectedEmail.account_manager_id ?? null}
                                            currentOwnerName={ownerOverrides[selectedEmail.contact_id]?.name ?? selectedEmail.account_manager_name ?? null}
                                            layout="compact"
                                            open
                                            onCancel={() => setOwnerPickerOpenFor(null)}
                                            onTransferred={(next) => {
                                                if (selectedEmail.contact_id) {
                                                    setOwnerOverrides(prev => ({ ...prev, [selectedEmail.contact_id as string]: next }));
                                                }
                                                setOwnerPickerOpenFor(null);
                                            }}
                                        />
                                    )}
                                    <div className="kv"><span className="k">Thread health</span><span className="v" style={{ color: 'var(--coach)' }}>{threadMessages.length > 2 ? 'Active' : 'New'}</span></div>
                                </div>
                            </div>
                        )}

                        {col3Tab === 'client' && (
                            <div className="jarvis-panel">
                                {selectedEmail.contact_id ? (
                                    <ClientIntelligencePanel
                                        profile={clientProfile!}
                                        isLoading={clientProfileLoading || !clientProfile}
                                        onSendReminder={() => {
                                            if (!clientProfile) return;
                                            const to = clientProfile.email;
                                            const name = clientProfile.name.split(' ')[0];
                                            setComposeDefaultTo(to);
                                            setComposeDefaultSubject(`Following up — ${clientProfile.finance.unpaidAmount > 0 ? 'Invoice reminder' : 'Checking in'}`);
                                            setComposeDefaultBody(`Hi ${name},\n\nJust wanted to follow up...\n\n`);
                                            setComposeOpen(true);
                                        }}
                                        onInvoice={() => {
                                            if (!clientProfile) return;
                                            const to = clientProfile.email;
                                            const name = clientProfile.name.split(' ')[0];
                                            const project = clientProfile.production.primaryProject?.name || 'your project';
                                            setComposeDefaultTo(to);
                                            setComposeDefaultSubject(`Invoice — ${project}`);
                                            setComposeDefaultBody(`Hi ${name},\n\nHope the ${project} film is everything you dreamed of!\nPlease find your invoice attached.\n\n`);
                                            setComposeOpen(true);
                                        }}
                                    />
                                ) : (
                                    <div className="ci-no-contact">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                        <p>No contact linked to this email</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* When no email selected, show full-width list placeholder */}
                {!hasEmail && (
                    <div className="col col-thread" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ textAlign: 'center', color: 'var(--ink-faint)' }}>
                            <Mail size={48} strokeWidth={1} />
                            <p style={{ marginTop: 12, fontSize: 14 }}>Select an email to read</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
