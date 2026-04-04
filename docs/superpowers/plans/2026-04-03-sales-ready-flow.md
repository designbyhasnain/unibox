# Sales-Ready Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Unibox from a dev-built CRM into a sales-agent-ready tool by building the "Today's Action Queue", upgrading the dashboard, adding one-click actions, role-based access, onboarding, and fixing the Chrome extension.

**Architecture:** The system already has campaigns, templates, contact detail, bulk actions, and intelligence. The gap is workflow — sales agents need a "what do I do RIGHT NOW" experience. We add an Action Queue (contacts needing attention, sorted by urgency), quick-action buttons (one-click template send, follow-up snooze), role-based views, and a first-login onboarding wizard.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (PostgreSQL), Server Actions, Chrome Extension (Manifest V3, Shadow DOM)

---

## File Structure

### New Files
- `app/actions/page.tsx` — Today's Action Queue page (who to contact now)
- `src/actions/actionQueueActions.ts` — Server actions for action queue data
- `app/components/QuickActions.tsx` — One-click action buttons (send template, snooze, mark done)
- `app/components/OnboardingWizard.tsx` — First-login setup wizard
- `src/actions/onboardingActions.ts` — Onboarding state persistence
- `app/components/ActionCard.tsx` — Individual action item card with urgency indicators

### Modified Files
- `app/dashboard/page.tsx` — Add Action Queue summary strip, "Start Selling" CTA
- `src/actions/dashboardActions.ts` — Add action queue counts to dashboard data
- `app/clients/page.tsx` — Add quick-action buttons per row
- `app/clients/[id]/page.tsx` — Add quick-action bar, template picker integration
- `app/components/Sidebar.tsx` — Add "Actions" nav item with badge count
- `app/components/ComposeModal.tsx` — Accept pre-filled template data from quick actions
- `chrome-extension/content/island.js` — Fix pill height, scan animation, expand/contract
- `chrome-extension/content/content_script.js` — Already updated for auto-fill (done)
- `prisma/schema.prisma` — Add role field to User model, onboarding_completed flag

---

### Task 1: Action Queue Server Actions

**Files:**
- Create: `src/actions/actionQueueActions.ts`
- Modify: `src/actions/dashboardActions.ts`

This task builds the data layer that powers the "who to contact today" queue. It combines three existing queries (waitingForReply, staleFollowUps, winBackCandidates from revenueActions.ts) into a unified, prioritized action queue.

- [ ] **Step 1: Create the action queue server action**

```typescript
// src/actions/actionQueueActions.ts
'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { getAccessibleGmailAccountIds } from '../utils/accessControl';

export type ActionItem = {
  id: string;
  contactId: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  location: string | null;
  stage: string;
  actionType: 'REPLY_NOW' | 'FOLLOW_UP' | 'WIN_BACK' | 'NEW_LEAD' | 'STALE';
  urgency: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  daysSinceContact: number;
  totalEmailsSent: number;
  totalEmailsReceived: number;
  lastEmailSubject: string | null;
  lastEmailDirection: string | null;
  estimatedValue: number | null;
  leadScore: number | null;
};

export async function getActionQueueAction(): Promise<{
  actions: ActionItem[];
  counts: { critical: number; high: number; medium: number; low: number; total: number };
}> {
  const { userId, role } = await ensureAuthenticated();
  const accessible = await getAccessibleGmailAccountIds(userId, role);
  const accountIds = accessible === 'ALL' ? null : accessible;

  const managerFilter = accountIds ? { account_manager_id: userId } : {};

  // 1. REPLY_NOW: They replied, you haven't responded (critical/high)
  const { data: needReply } = await supabase
    .from('contacts')
    .select('id, name, email, company, phone, location, pipeline_stage, days_since_last_contact, total_emails_sent, total_emails_received, estimated_value, lead_score, last_email_subject, last_message_direction')
    .eq('last_message_direction', 'RECEIVED')
    .gt('total_emails_received', 0)
    .not('email', 'ilike', '%noreply%')
    .not('email', 'ilike', '%mailer-daemon%')
    .not('pipeline_stage', 'eq', 'NOT_INTERESTED')
    .not('pipeline_stage', 'eq', 'CLOSED')
    .match(managerFilter)
    .order('days_since_last_contact', { ascending: true })
    .limit(30);

  // 2. FOLLOW_UP: You emailed, no reply, 3-14 days ago (medium)
  const { data: needFollowUp } = await supabase
    .from('contacts')
    .select('id, name, email, company, phone, location, pipeline_stage, days_since_last_contact, total_emails_sent, total_emails_received, estimated_value, lead_score, last_email_subject, last_message_direction')
    .eq('last_message_direction', 'SENT')
    .eq('total_emails_received', 0)
    .gte('days_since_last_contact', 3)
    .lte('days_since_last_contact', 14)
    .gt('total_emails_sent', 0)
    .lte('total_emails_sent', 3)
    .not('pipeline_stage', 'eq', 'NOT_INTERESTED')
    .not('pipeline_stage', 'eq', 'CLOSED')
    .match(managerFilter)
    .order('days_since_last_contact', { ascending: true })
    .limit(30);

  // 3. NEW_LEAD: Added in last 48h, never emailed (high)
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: newLeads } = await supabase
    .from('contacts')
    .select('id, name, email, company, phone, location, pipeline_stage, days_since_last_contact, total_emails_sent, total_emails_received, estimated_value, lead_score, last_email_subject, last_message_direction')
    .gte('created_at', twoDaysAgo)
    .eq('total_emails_sent', 0)
    .in('pipeline_stage', ['COLD_LEAD', 'LEAD'])
    .match(managerFilter)
    .order('lead_score', { ascending: false })
    .limit(20);

  // 4. WIN_BACK: Was engaged (5+ emails), went silent 30+ days (low)
  const { data: winBack } = await supabase
    .from('contacts')
    .select('id, name, email, company, phone, location, pipeline_stage, days_since_last_contact, total_emails_sent, total_emails_received, estimated_value, lead_score, last_email_subject, last_message_direction')
    .gt('total_emails_received', 4)
    .gt('days_since_last_contact', 30)
    .not('pipeline_stage', 'eq', 'CLOSED')
    .not('pipeline_stage', 'eq', 'NOT_INTERESTED')
    .match(managerFilter)
    .order('total_emails_received', { ascending: false })
    .limit(20);

  const actions: ActionItem[] = [];

  // Map REPLY_NOW
  for (const c of needReply || []) {
    const days = c.days_since_last_contact || 0;
    actions.push({
      id: `reply-${c.id}`,
      contactId: c.id,
      name: c.name,
      email: c.email,
      company: c.company,
      phone: c.phone,
      location: c.location,
      stage: c.pipeline_stage,
      actionType: 'REPLY_NOW',
      urgency: days <= 1 ? 'critical' : days <= 3 ? 'high' : 'medium',
      reason: days === 0 ? 'Replied today - respond now!' : `Replied ${days}d ago - don't lose momentum`,
      daysSinceContact: days,
      totalEmailsSent: c.total_emails_sent || 0,
      totalEmailsReceived: c.total_emails_received || 0,
      lastEmailSubject: c.last_email_subject,
      lastEmailDirection: c.last_message_direction,
      estimatedValue: c.estimated_value,
      leadScore: c.lead_score,
    });
  }

  // Map NEW_LEAD
  for (const c of newLeads || []) {
    actions.push({
      id: `new-${c.id}`,
      contactId: c.id,
      name: c.name,
      email: c.email,
      company: c.company,
      phone: c.phone,
      location: c.location,
      stage: c.pipeline_stage,
      actionType: 'NEW_LEAD',
      urgency: 'high',
      reason: 'New lead - send first outreach',
      daysSinceContact: c.days_since_last_contact || 0,
      totalEmailsSent: 0,
      totalEmailsReceived: 0,
      lastEmailSubject: null,
      lastEmailDirection: null,
      estimatedValue: c.estimated_value,
      leadScore: c.lead_score,
    });
  }

  // Map FOLLOW_UP
  for (const c of needFollowUp || []) {
    actions.push({
      id: `followup-${c.id}`,
      contactId: c.id,
      name: c.name,
      email: c.email,
      company: c.company,
      phone: c.phone,
      location: c.location,
      stage: c.pipeline_stage,
      actionType: 'FOLLOW_UP',
      urgency: 'medium',
      reason: `No reply after ${c.total_emails_sent} email${c.total_emails_sent > 1 ? 's' : ''} - follow up`,
      daysSinceContact: c.days_since_last_contact || 0,
      totalEmailsSent: c.total_emails_sent || 0,
      totalEmailsReceived: 0,
      lastEmailSubject: c.last_email_subject,
      lastEmailDirection: 'SENT',
      estimatedValue: c.estimated_value,
      leadScore: c.lead_score,
    });
  }

  // Map WIN_BACK
  for (const c of winBack || []) {
    actions.push({
      id: `winback-${c.id}`,
      contactId: c.id,
      name: c.name,
      email: c.email,
      company: c.company,
      phone: c.phone,
      location: c.location,
      stage: c.pipeline_stage,
      actionType: 'WIN_BACK',
      urgency: 'low',
      reason: `Was active (${c.total_emails_received} replies), silent ${c.days_since_last_contact}d`,
      daysSinceContact: c.days_since_last_contact || 0,
      totalEmailsSent: c.total_emails_sent || 0,
      totalEmailsReceived: c.total_emails_received || 0,
      lastEmailSubject: c.last_email_subject,
      lastEmailDirection: c.last_message_direction,
      estimatedValue: c.estimated_value,
      leadScore: c.lead_score,
    });
  }

  // Sort: critical first, then high, medium, low
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  actions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  const counts = {
    critical: actions.filter(a => a.urgency === 'critical').length,
    high: actions.filter(a => a.urgency === 'high').length,
    medium: actions.filter(a => a.urgency === 'medium').length,
    low: actions.filter(a => a.urgency === 'low').length,
    total: actions.length,
  };

  return { actions, counts };
}

export async function snoozeActionAction(contactId: string, days: number) {
  await ensureAuthenticated();
  const snoozeUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('contacts').update({ next_followup_at: snoozeUntil }).eq('id', contactId);
  return { success: true };
}

export async function markActionDoneAction(contactId: string) {
  await ensureAuthenticated();
  await supabase.from('contacts').update({
    next_followup_at: null,
    auto_followup_enabled: false,
  }).eq('id', contactId);
  return { success: true };
}
```

- [ ] **Step 2: Add action queue counts to dashboard action**

In `src/actions/dashboardActions.ts`, add after the `followUpsDue` query (around line 75):

```typescript
  // Action queue counts for dashboard strip
  const replyNowQuery = supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('last_message_direction', 'RECEIVED')
    .gt('total_emails_received', 0)
    .not('email', 'ilike', '%noreply%')
    .not('pipeline_stage', 'eq', 'NOT_INTERESTED')
    .not('pipeline_stage', 'eq', 'CLOSED');
  const { count: replyNowCount } = accountIds
    ? await replyNowQuery.eq('account_manager_id', userId)
    : await replyNowQuery;
```

Add `replyNowCount: replyNowCount || 0` to the return object.

- [ ] **Step 3: Verify action compiles**

Run: `npx tsc --noEmit src/actions/actionQueueActions.ts` or check for import errors.

- [ ] **Step 4: Commit**

```bash
git add src/actions/actionQueueActions.ts src/actions/dashboardActions.ts
git commit -m "feat: add action queue server actions for sales priority queue"
```

---

### Task 2: Action Queue Page

**Files:**
- Create: `app/actions/page.tsx`
- Create: `app/components/ActionCard.tsx`

The main sales agent page — "What do I do right now?" Shows prioritized list of contacts needing attention with one-click actions.

- [ ] **Step 1: Create ActionCard component**

```typescript
// app/components/ActionCard.tsx
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
  REPLY_NOW: '\u{1F4E9}',  // incoming envelope
  NEW_LEAD: '\u{1F195}',   // NEW
  FOLLOW_UP: '\u{1F504}',  // arrows
  WIN_BACK: '\u{1F3AF}',   // target
  STALE: '\u{1F4A4}',      // zzz
};

type Props = {
  action: ActionItem;
  onQuickEmail: (action: ActionItem) => void;
  onSnooze: (contactId: string, days: number) => void;
  onDone: (contactId: string) => void;
};

export default function ActionCard({ action, onQuickEmail, onSnooze, onDone }: Props) {
  const style = URGENCY_STYLES[action.urgency];
  const icon = ACTION_ICONS[action.actionType] || '\u{1F4CB}';

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
      {/* Icon */}
      <span style={{ fontSize: 24, flexShrink: 0 }}>{icon}</span>

      {/* Info */}
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
          {action.estimatedValue && (
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

      {/* Quick Actions */}
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
          {'\u{23F0}'} 3d
        </button>
        <button onClick={() => onDone(action.contactId)} style={{
          background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 6,
          padding: '6px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer',
        }} title="Mark done">
          {'\u{2713}'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the Action Queue page**

```typescript
// app/actions/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useContext } from 'react';
import { getActionQueueAction, snoozeActionAction, markActionDoneAction } from '../../src/actions/actionQueueActions';
import type { ActionItem } from '../../src/actions/actionQueueActions';
import ActionCard from '../components/ActionCard';
import { PageLoader } from '../components/LoadingStates';
import { UIContext } from '../context/UIContext';

export default function ActionsPage() {
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [counts, setCounts] = useState({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const ui = useContext(UIContext);

  const load = useCallback(async () => {
    try {
      const result = await getActionQueueAction();
      setActions(result.actions);
      setCounts(result.counts);
    } catch (e) {
      console.error('Failed to load action queue:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleQuickEmail = (action: ActionItem) => {
    // Open compose modal with pre-filled To address
    if (ui?.openCompose) {
      ui.openCompose({ to: action.email, contactName: action.name });
    }
  };

  const handleSnooze = async (contactId: string, days: number) => {
    setActions(prev => prev.filter(a => a.contactId !== contactId));
    setCounts(prev => ({ ...prev, total: prev.total - 1 }));
    await snoozeActionAction(contactId, days);
  };

  const handleDone = async (contactId: string) => {
    setActions(prev => prev.filter(a => a.contactId !== contactId));
    setCounts(prev => ({ ...prev, total: prev.total - 1 }));
    await markActionDoneAction(contactId);
  };

  const filtered = filter === 'ALL' ? actions : actions.filter(a => a.actionType === filter);

  if (loading) return <PageLoader isLoading={true} type="list" count={6}><div /></PageLoader>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        .aq-page { font-family: 'DM Sans', system-ui, sans-serif; height: 100%; overflow-y: auto; background: #f8fafc; }
        .aq-mono { font-family: 'DM Mono', monospace; }
        .aq-filter { padding: 6px 14px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; color: #64748b; }
        .aq-filter:hover { border-color: #2563eb; color: #2563eb; }
        .aq-filter-active { background: #2563eb; color: #fff; border-color: #2563eb; }
      `}</style>

      <div className="aq-page">
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #fef2f2 0%, #f8fafc 40%, #eff6ff 100%)',
          borderBottom: '1px solid #e2e8f0', padding: '20px 32px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-.02em' }}>
              {'\u{1F3AF}'} Today&apos;s Actions
            </h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', fontWeight: 500 }}>
              {counts.total} contacts need your attention
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {counts.critical > 0 && (
              <div className="aq-mono" style={{
                background: '#dc2626', color: '#fff', padding: '4px 12px', borderRadius: 6,
                fontSize: 13, fontWeight: 700, animation: 'pulse 2s ease-in-out infinite',
              }}>
                {counts.critical} URGENT
              </div>
            )}
            <button onClick={load} style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
              padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#64748b',
            }}>
              {'\u{1F504}'} Refresh
            </button>
          </div>
        </div>

        {/* Summary Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: '12px 32px' }}>
          {[
            { n: counts.critical, l: 'Reply Now', color: '#dc2626', bg: '#fef2f2' },
            { n: actions.filter(a => a.actionType === 'NEW_LEAD').length, l: 'New Leads', color: '#7c3aed', bg: '#faf5ff' },
            { n: actions.filter(a => a.actionType === 'FOLLOW_UP').length, l: 'Follow Up', color: '#2563eb', bg: '#eff6ff' },
            { n: actions.filter(a => a.actionType === 'WIN_BACK').length, l: 'Win Back', color: '#d97706', bg: '#fffbeb' },
          ].map(s => (
            <div key={s.l} style={{
              background: s.bg, borderRadius: 8, padding: '10px 16px', textAlign: 'center',
              border: `1px solid ${s.color}20`,
            }}>
              <div className="aq-mono" style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.n}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', letterSpacing: '.04em' }}>{s.l.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Filter Bar */}
        <div style={{ padding: '0 32px 12px', display: 'flex', gap: 6 }}>
          {[
            { key: 'ALL', label: `All (${counts.total})` },
            { key: 'REPLY_NOW', label: 'Reply Now' },
            { key: 'NEW_LEAD', label: 'New Leads' },
            { key: 'FOLLOW_UP', label: 'Follow Up' },
            { key: 'WIN_BACK', label: 'Win Back' },
          ].map(f => (
            <button key={f.key}
              className={`aq-filter ${filter === f.key ? 'aq-filter-active' : ''}`}
              onClick={() => setFilter(f.key)}
            >{f.label}</button>
          ))}
        </div>

        {/* Action List */}
        <div style={{ padding: '0 32px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{'\u{1F389}'}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>All caught up!</div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No actions needed right now. Check back later.</div>
            </div>
          ) : filtered.map(action => (
            <ActionCard
              key={action.id}
              action={action}
              onQuickEmail={handleQuickEmail}
              onSnooze={handleSnooze}
              onDone={handleDone}
            />
          ))}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify page renders**

Run: `npm run dev` and navigate to `/actions`

- [ ] **Step 4: Commit**

```bash
git add app/actions/page.tsx app/components/ActionCard.tsx
git commit -m "feat: add Today's Actions queue page for sales agents"
```

---

### Task 3: Add Actions to Sidebar Navigation

**Files:**
- Modify: `app/components/Sidebar.tsx`

Add the Actions page link with live badge count showing urgent items.

- [ ] **Step 1: Read current Sidebar.tsx to find nav items array**

Find the navigation items list in Sidebar.tsx and add the Actions page entry.

- [ ] **Step 2: Add Actions nav item with badge**

Add this entry to the navigation items array, positioned second (after Dashboard, before Inbox):

```tsx
{
  href: '/actions',
  label: 'Actions',
  icon: '\u{1F3AF}', // or use an appropriate icon component
}
```

Add a badge showing action count. Fetch `getActionQueueAction` count or use a lighter endpoint:

```tsx
// Add state for action count
const [actionCount, setActionCount] = useState(0);

// Fetch on mount + poll every 60s
useEffect(() => {
  const fetchCount = async () => {
    try {
      const result = await getActionQueueAction();
      setActionCount(result.counts.critical + result.counts.high);
    } catch {}
  };
  fetchCount();
  const interval = setInterval(fetchCount, 60000);
  return () => clearInterval(interval);
}, []);
```

Render the badge next to the label:

```tsx
{actionCount > 0 && (
  <span style={{
    background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 700,
    padding: '1px 7px', borderRadius: 10, marginLeft: 'auto',
  }}>{actionCount}</span>
)}
```

- [ ] **Step 3: Verify sidebar shows Actions with badge**

Navigate to any page and confirm the sidebar has the Actions link with a red badge.

- [ ] **Step 4: Commit**

```bash
git add app/components/Sidebar.tsx
git commit -m "feat: add Actions nav item to sidebar with urgency badge"
```

---

### Task 4: Upgrade Dashboard with Action Queue Strip

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `src/actions/dashboardActions.ts`

Add a "Start Selling" call-to-action and action queue summary to the dashboard.

- [ ] **Step 1: Add action queue data to dashboard**

In `dashboardActions.ts`, add a query for reply-now count and new leads needing first contact. Add to return object:

```typescript
replyNowCount: replyNowCount || 0,
```

- [ ] **Step 2: Add CTA strip to dashboard page**

After the Priority Strip section (around line 226), add:

```tsx
{/* ── START SELLING CTA ── */}
<div className="dash-anim-5" style={{ padding: '0 32px', marginBottom: 16 }}>
  <Link href="/actions" style={{
    display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none',
    background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
    borderRadius: 10, padding: '16px 24px', color: '#fff',
    transition: 'transform .15s, box-shadow .15s',
  }}
  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(37,99,235,.3)'; }}
  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
  >
    <span style={{ fontSize: 32 }}>{'\u{1F3AF}'}</span>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>Start Selling</div>
      <div style={{ fontSize: 12, opacity: .8, marginTop: 2 }}>
        {data.replyNowCount > 0 ? `${data.replyNowCount} people waiting for your reply` : 'Check your action queue'}
      </div>
    </div>
    <span style={{ fontSize: 24, opacity: .8 }}>{'\u{2192}'}</span>
  </Link>
</div>
```

- [ ] **Step 3: Verify dashboard shows CTA**

Navigate to `/dashboard` and confirm the "Start Selling" button appears.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx src/actions/dashboardActions.ts
git commit -m "feat: add Start Selling CTA to dashboard linking to action queue"
```

---

### Task 5: Fix Chrome Extension Dynamic Island

**Files:**
- Modify: `chrome-extension/content/island.js`

Fix the pill visibility (too thin), scan animation (invisible bars), and expand/contract behavior.

- [ ] **Step 1: Read current island.js and identify CSS issues**

Read the full island.js to find the current pill dimensions, scan bar styles, and animation definitions.

- [ ] **Step 2: Fix pill height and visibility**

Ensure the idle pill has explicit dimensions:
```css
.s-idle {
  height: 40px !important;
  min-height: 40px !important;
  max-width: 180px;
  opacity: 1 !important;
}
```

- [ ] **Step 3: Fix scan animation bars**

Ensure scan bars have explicit height and animation:
```css
.scan-bar {
  height: 14px !important;
  min-height: 14px !important;
  background: #00ff41;
  border-radius: 2px;
  animation: scanPulse 0.8s ease-in-out infinite alternate;
}

@keyframes scanPulse {
  0% { opacity: 0.3; transform: scaleX(0.5); }
  100% { opacity: 1; transform: scaleX(1); }
}
```

- [ ] **Step 4: Fix expand/contract transitions**

Ensure container transitions smoothly between states:
```css
.island-container {
  transition: width 0.3s ease, height 0.3s ease, max-width 0.3s ease, border-radius 0.3s ease;
}
```

- [ ] **Step 5: Test by reviewing DOM structure in code**

Trace through mount() -> scanning() -> showHot()/showExists() to verify DOM elements are created with correct classes and styles.

- [ ] **Step 6: Commit**

```bash
git add chrome-extension/content/island.js
git commit -m "fix: extension Dynamic Island pill height, scan animation, transitions"
```

---

### Task 6: Add Quick Actions to Clients Page

**Files:**
- Modify: `app/clients/page.tsx`

Add inline quick-action buttons per client row — Email, Snooze, View — so agents can act without navigating.

- [ ] **Step 1: Read clients page to find table row rendering**

Find the table row map in `app/clients/page.tsx` where each client is rendered.

- [ ] **Step 2: Add quick-action buttons to each row**

After the last column in each client row, add action buttons:

```tsx
<td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
  <div style={{ display: 'flex', gap: 4 }}>
    <button onClick={() => openCompose({ to: client.email, contactName: client.name })}
      style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
      title="Send email"
    >Email</button>
    <Link href={`/clients/${client.id}`}
      style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', fontSize: 11, fontWeight: 500, textDecoration: 'none' }}
    >View</Link>
  </div>
</td>
```

- [ ] **Step 3: Verify buttons appear and work**

Navigate to `/clients`, confirm Email and View buttons appear on each row.

- [ ] **Step 4: Commit**

```bash
git add app/clients/page.tsx
git commit -m "feat: add quick-action buttons to client rows"
```

---

### Task 7: Role-Based Access Control

**Files:**
- Modify: `prisma/schema.prisma`
- Create migration
- Modify: `src/lib/safe-action.ts` (or access control utility)
- Modify: `app/components/Sidebar.tsx`

Add role field to User model. Sales agents see: Dashboard, Actions, Inbox, Sent, Clients, Templates. Admins see everything.

- [ ] **Step 1: Add role field to User model in schema.prisma**

```prisma
enum UserRole {
  ADMIN
  SALES_AGENT
  VIEWER
  @@map("user_role")
}

// Add to User model:
role  UserRole @default(SALES_AGENT) @map("role")
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-user-role
```

- [ ] **Step 3: Add role check utility**

In `src/utils/accessControl.ts` (or create), add:

```typescript
export function canAccess(role: string, page: string): boolean {
  const SALES_PAGES = ['/dashboard', '/actions', '/', '/sent', '/clients', '/templates', '/campaigns'];
  if (role === 'ADMIN') return true;
  if (role === 'SALES_AGENT') return SALES_PAGES.some(p => page.startsWith(p));
  return false;
}
```

- [ ] **Step 4: Filter sidebar nav items by role**

In Sidebar.tsx, wrap admin-only items (Intelligence, Finance, Settings, Team, Accounts) with a role check:

```tsx
{role === 'ADMIN' && (
  <NavItem href="/intelligence" ... />
)}
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/utils/accessControl.ts app/components/Sidebar.tsx
git commit -m "feat: add role-based access control for sales agents vs admins"
```

---

### Task 8: Onboarding Wizard

**Files:**
- Create: `app/components/OnboardingWizard.tsx`
- Modify: `app/layout.tsx` or `app/dashboard/page.tsx`
- Modify: `prisma/schema.prisma`

First-login wizard: Welcome -> Connect Gmail -> Install Extension -> Set API Key -> Done.

- [ ] **Step 1: Add onboarding flag to User model**

```prisma
// Add to User model:
onboardingCompleted  Boolean @default(false) @map("onboarding_completed")
```

- [ ] **Step 2: Create OnboardingWizard component**

Build a 4-step modal wizard:
1. Welcome - "Welcome to Unibox! Let's get you set up."
2. Gmail - "Connect your Gmail account" (link to /accounts)
3. Extension - "Install the Chrome Extension" (download button)
4. API Key - "Set your extension API key" (show key, copy button)
5. Done - "You're all set! Start selling."

Each step has Next/Skip buttons. Completion calls server action to set onboarding_completed = true.

- [ ] **Step 3: Show wizard on dashboard if not completed**

In dashboard page, check if user.onboarding_completed === false and render the wizard overlay.

- [ ] **Step 4: Commit**

```bash
git add app/components/OnboardingWizard.tsx prisma/schema.prisma app/dashboard/page.tsx
git commit -m "feat: add first-login onboarding wizard for sales agents"
```

---

### Task 9: Quick Template Send from Action Queue

**Files:**
- Create: `app/components/QuickActions.tsx`
- Modify: `app/actions/page.tsx`

When sales agent clicks "Email" on an action card, show a template picker dropdown instead of blank compose.

- [ ] **Step 1: Create QuickActions component**

```typescript
// app/components/QuickActions.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { getTemplatesAction } from '../../src/actions/templateActions';

type Props = {
  contactEmail: string;
  contactName: string;
  actionType: string;
  onSendWithTemplate: (template: { subject: string; body: string }) => void;
  onSendBlank: () => void;
  onClose: () => void;
};

export default function QuickActions({ contactEmail, contactName, actionType, onSendWithTemplate, onSendBlank, onClose }: Props) {
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    getTemplatesAction().then(t => {
      // Filter by relevant category
      const category = actionType === 'NEW_LEAD' ? 'COLD_OUTREACH'
        : actionType === 'FOLLOW_UP' ? 'FOLLOW_UP'
        : actionType === 'WIN_BACK' ? 'RETARGETING'
        : null;
      setTemplates(category ? t.filter((tmpl: any) => tmpl.category === category) : t);
    });
  }, [actionType]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.3)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 12, padding: 24, width: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,.15)', maxHeight: '70vh', overflowY: 'auto',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
          Email {contactName}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>{contactEmail}</div>

        <button onClick={onSendBlank} style={{
          width: '100%', padding: '10px 16px', background: '#f8fafc', border: '1px solid #e2e8f0',
          borderRadius: 8, cursor: 'pointer', textAlign: 'left', marginBottom: 8,
          fontSize: 13, fontWeight: 600, color: '#0f172a',
        }}>
          {'\u{270F}\u{FE0F}'} Write from scratch
        </button>

        {templates.length > 0 && (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8, marginTop: 12, letterSpacing: '.04em' }}>
            SUGGESTED TEMPLATES
          </div>
        )}

        {templates.map((t: any) => (
          <button key={t.id} onClick={() => onSendWithTemplate({ subject: t.subject, body: t.body })} style={{
            width: '100%', padding: '10px 16px', background: '#fff', border: '1px solid #e2e8f0',
            borderRadius: 8, cursor: 'pointer', textAlign: 'left', marginBottom: 6,
            transition: 'border-color .15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#2563eb')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{t.name}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{t.subject}</div>
          </button>
        ))}

        {templates.length === 0 && (
          <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
            No templates for this action type yet. Create them in Templates page.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate QuickActions into Action Queue page**

In `app/actions/page.tsx`, add state for the template picker:

```tsx
const [quickAction, setQuickAction] = useState<ActionItem | null>(null);
```

Replace `handleQuickEmail` to show the picker:

```tsx
const handleQuickEmail = (action: ActionItem) => {
  setQuickAction(action);
};
```

Render the picker when active:

```tsx
{quickAction && (
  <QuickActions
    contactEmail={quickAction.email}
    contactName={quickAction.name}
    actionType={quickAction.actionType}
    onSendWithTemplate={(template) => {
      if (ui?.openCompose) {
        ui.openCompose({
          to: quickAction.email,
          contactName: quickAction.name,
          subject: template.subject,
          body: template.body,
        });
      }
      setQuickAction(null);
    }}
    onSendBlank={() => {
      if (ui?.openCompose) {
        ui.openCompose({ to: quickAction.email, contactName: quickAction.name });
      }
      setQuickAction(null);
    }}
    onClose={() => setQuickAction(null)}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
git add app/components/QuickActions.tsx app/actions/page.tsx
git commit -m "feat: add template picker for quick email from action queue"
```

---

### Task 10: Deploy and Test

**Files:**
- No new files

- [ ] **Step 1: Run build to check for errors**

```bash
npm run build
```

Fix any TypeScript errors, missing imports, or build failures.

- [ ] **Step 2: Push to deploy**

```bash
git push origin main
```

- [ ] **Step 3: Verify on production**

Check these flows on the deployed site:
1. Dashboard loads with "Start Selling" CTA
2. `/actions` page shows prioritized contacts
3. Click "Email" opens template picker -> compose modal
4. Snooze and Done buttons work
5. Sidebar shows Actions with badge count
6. Extension pill is visible with proper height
7. Extension scan animation shows animated bars

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: post-deploy fixes for sales-ready flow"
```
