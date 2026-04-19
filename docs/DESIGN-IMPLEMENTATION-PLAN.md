# Pixel-Perfect Design Implementation Plan

## Overview

Implement the complete Unibox design from the Claude Design prototype (5,054 lines across 13 files). Every color, spacing, radius, shadow, font size must match exactly. No approximations.

**Source files:** `/tmp/unibox-design/unibox/project/`
**Target:** Production Next.js app

---

## Phase 0: CSS Foundation (globals.css rewrite)

**What:** Replace the entire design token system and base styles with the prototype's `styles.css`.

### 0.1 Design Tokens (:root)

Replace current `:root` variables with these EXACT values from the design:

```css
/* Dark theme (default) */
--canvas: oklch(0.17 0.004 260);
--shell: oklch(0.215 0.006 260);
--surface: oklch(0.245 0.006 260);
--surface-2: oklch(0.27 0.007 260);
--surface-hover: oklch(0.285 0.008 260);
--hairline: oklch(0.32 0.007 260);
--hairline-soft: oklch(0.28 0.006 260);

--ink: oklch(0.965 0.003 80);
--ink-2: oklch(0.82 0.006 260);
--ink-muted: oklch(0.66 0.008 260);
--ink-faint: oklch(0.48 0.008 260);
--ink-dim: oklch(0.38 0.008 260);

--accent: oklch(0.62 0.18 295);      /* jarvis purple */
--accent-soft: oklch(0.35 0.09 295);
--accent-ink: oklch(0.82 0.14 295);
--coach: oklch(0.68 0.14 160);        /* coaching green */
--coach-soft: oklch(0.32 0.07 160);
--warn: oklch(0.78 0.15 75);
--warn-soft: oklch(0.34 0.07 75);
--danger: oklch(0.68 0.18 25);
--danger-soft: oklch(0.34 0.09 25);
--info: oklch(0.72 0.13 230);
--info-soft: oklch(0.32 0.07 230);

--radius-shell: 20px;
--radius-card: 14px;
--radius-soft: 10px;
--radius-pill: 999px;

--shadow-shell: 0 30px 80px -30px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.3);
--shadow-pop: 0 12px 40px -12px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35);

--font-ui: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
--font-mono: "JetBrains Mono", ui-monospace, monospace;

--dur-fast: 120ms;
--dur: 200ms;
--dur-slow: 320ms;
--ease: cubic-bezier(0.4, 0, 0.2, 1);
```

### 0.2 Light theme ([data-theme="light"])

```css
--canvas: oklch(0.94 0.004 85);
--shell: oklch(0.985 0.003 85);
--surface: oklch(0.975 0.003 85);
--surface-2: oklch(0.96 0.003 85);
--surface-hover: oklch(0.95 0.004 85);
--hairline: oklch(0.9 0.004 85);
--hairline-soft: oklch(0.93 0.004 85);
--ink: oklch(0.2 0.01 280);
--ink-2: oklch(0.32 0.008 280);
--ink-muted: oklch(0.5 0.008 280);
--ink-faint: oklch(0.62 0.008 280);
--ink-dim: oklch(0.75 0.008 280);
--shadow-shell: 0 30px 80px -30px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.05);
--shadow-pop: 0 12px 40px -12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.08);
```

### 0.3 Body & Reset

```css
body {
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--font-ui);
  font-feature-settings: "cv11", "ss01";
  font-size: 13.5px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
```

### 0.4 Variable Mapping (old → new)

Must map old CSS variable names to new ones so existing components don't break:

| Old Variable | New Variable | Notes |
|-------------|-------------|-------|
| `--bg-base` | `--canvas` | Main background |
| `--bg-surface` | `--shell` | Card/panel background |
| `--bg-elevated` | `--surface` | Elevated surface |
| `--bg-hover` | `--surface-hover` | Hover state |
| `--bg-active` | `--surface-2` | Active/selected |
| `--text-primary` | `--ink` | Primary text |
| `--text-secondary` | `--ink-2` | Secondary text |
| `--text-muted` | `--ink-muted` | Muted text |
| `--border` | `--hairline` | Border color |
| `--border-subtle` | `--hairline-soft` | Subtle border |
| `--accent` | `--accent` | Keep name, change value |

**Strategy:** Keep old variable names as aliases pointing to new values so nothing breaks:
```css
--bg-base: var(--canvas);
--bg-surface: var(--shell);
--text-primary: var(--ink);
/* etc. */
```

**Files changed:** `app/globals.css`

---

## Phase 1: App Shell & Layout

**What:** Floating rounded shell, 14px padding, grid layout

### 1.1 Layout Container

```css
.app / .layout-container {
  height: 100vh;
  padding: 14px;
  display: flex;
  gap: 0;
}
.shell / .layout-container > inner {
  flex: 1;
  display: grid;
  grid-template-columns: var(--sb-w, 248px) 1fr;
  background: var(--shell);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-shell); /* 20px */
  box-shadow: var(--shadow-shell);
  overflow: hidden;
  position: relative;
}
```

### 1.2 Implementation

- `app/layout.tsx` — wrap children in shell div with proper structure
- `app/components/ClientLayout.tsx` — update to use new shell classes
- `app/globals.css` — replace `.layout-container` and `.layout-content` styles

**Files changed:** `app/layout.tsx`, `app/components/ClientLayout.tsx`, `app/globals.css`

---

## Phase 2: Sidebar (exact match to sidebar.jsx)

**What:** Redesign sidebar to match prototype exactly

### 2.1 Structure

```
aside.sidebar
  ├── div.brand
  │   ├── div.brand-mark (28x28px, radial gradient purple, "U")
  │   ├── div.brand-name ("Unibox", 14px 600wt)
  │   └── div.brand-env (pill: green dot + "Live")
  ├── button.compose-btn (full-width, dark bg, white text, 10px radius)
  ├── div.nav-search (search input inside sidebar, ⌘K hint)
  ├── div.nav-scroll (scrollable)
  │   └── div.nav-group × N
  │       ├── div.nav-group-label (10px uppercase, ink-dim)
  │       └── div.nav-item × N (7px 10px padding, 8px radius, NOT pill)
  │           ├── Icon (15x15px, 0.75 opacity)
  │           ├── span.label
  │           └── span.badge (optional, pill shape)
  └── div.account-filter (user card at bottom, avatar + name + sub)
```

### 2.2 Key CSS Values

| Element | Property | Value |
|---------|----------|-------|
| `.sidebar` | padding | `14px 12px 12px` |
| `.sidebar` | gap | `12px` |
| `.sidebar` | border-right | `1px solid var(--hairline-soft)` |
| `.sidebar` | background | `linear-gradient(180deg, var(--shell), var(--shell))` |
| `.brand-mark` | size | `28x28px` |
| `.brand-mark` | border-radius | `8px` |
| `.brand-mark` | background | `radial-gradient(circle at 30% 30%, oklch(0.72 0.18 295)..., oklch(0.22 0.03 280))` |
| `.brand-name` | font | `600 14px` |
| `.brand-env` | style | pill, 10.5px, ink-muted, 1px hairline border |
| `.live-dot` | size | `6x6px` |
| `.live-dot` | color | `var(--coach)` green |
| `.live-dot` | glow | `box-shadow: 0 0 0 3px color-mix(var(--coach), transparent 80%)` |
| `.compose-btn` | padding | `9px 12px` |
| `.compose-btn` | background | `var(--ink)` (white text on dark bg) |
| `.compose-btn` | color | `var(--canvas)` |
| `.compose-btn` | radius | `10px` |
| `.compose-btn` | font | `600 12.5px` |
| `.nav-search` | padding | `7px 10px` |
| `.nav-search` | background | `color-mix(var(--surface), transparent 40%)` |
| `.nav-search` | radius | `9px` |
| `.nav-group-label` | font | `500 10px uppercase, 0.08em tracking` |
| `.nav-group-label` | color | `var(--ink-dim)` |
| `.nav-item` | padding | `7px 10px` |
| `.nav-item` | margin | `1px 4px` |
| `.nav-item` | radius | `8px` (NOT 999px pill!) |
| `.nav-item` | font | `13px` |
| `.nav-item` | color | `var(--ink-2)` |
| `.nav-item:hover` | background | `var(--surface)` |
| `.nav-item.active` | background | `var(--surface)` |
| `.nav-item.active` | box-shadow | `inset 0 0 0 1px var(--hairline)` |
| `.nav-item.active::before` | left accent bar | `2px wide, var(--ink), left: -4px` |
| `.nav-item svg` | size | `15x15px, opacity 0.75` |
| `.badge` | font | `600 10.5px` |
| `.badge.priority` | background | `color-mix(var(--danger-soft), transparent 20%)` |
| `.badge.unread` | background | `color-mix(var(--accent-soft), transparent 10%)` |
| `.account-filter` | padding | `10px` |
| `.account-filter` | border | `1px solid var(--hairline-soft)` |
| `.account-filter` | radius | `var(--radius-card)` (14px) |
| `.account-filter .avatar` | size | `30x30px` |

### 2.3 Implementation

- Rewrite `app/components/Sidebar.tsx` to match exact structure
- Update all sidebar CSS in `globals.css`

**Files changed:** `app/components/Sidebar.tsx`, `app/globals.css`

---

## Phase 3: Topbar

**What:** Simpler topbar inside main content area

### 3.1 Structure

```
div.topbar
  ├── h1 (14px 600wt, with "CRM /" crumb in ink-muted)
  ├── span (sync status, 11.5px, live-dot + "Syncing · 2 min ago")
  ├── div.spacer
  └── icon-btn × 3 (bell, refresh, settings)
```

### 3.2 Key CSS

| Element | Property | Value |
|---------|----------|-------|
| `.topbar` | padding | `12px 18px` |
| `.topbar` | min-height | `54px` |
| `.topbar` | border-bottom | `1px solid var(--hairline-soft)` |
| `.topbar h1` | font | `600 14px, -0.005em tracking` |
| `.icon-btn` | size | `30x30px` |
| `.icon-btn` | radius | `8px` |
| `.icon-btn svg` | size | `15x15px` |

**Files changed:** `app/components/Topbar.tsx`, `app/globals.css`

---

## Phase 4: Inbox (3-Column Layout)

**What:** Complete inbox redesign — email list | thread | Jarvis panel

### 4.1 Layout

```css
.inbox {
  display: grid;
  grid-template-columns: var(--list-w, 380px) 1fr var(--jar-w, 340px);
  flex: 1;
}
```

### 4.2 Email List Column

| Element | Property | Value |
|---------|----------|-------|
| `.col-list` | border-right | `1px solid var(--hairline-soft)` |
| `.col-head` | padding | `12px 16px` |
| `.col-head` | min-height | `50px` |
| `.tabs` | background | `var(--surface)` |
| `.tabs` | radius | `8px` |
| `.tabs` | border | `1px solid var(--hairline-soft)` |
| `.tabs button` | font | `500 12px` |
| `.tabs button.active` | background | `var(--shell)` |
| `.tabs button.active` | box-shadow | `0 1px 2px rgba(0,0,0,0.25)` |
| `.email-row` | grid | `36px 1fr auto` |
| `.email-row` | padding | `12px 16px` |
| `.email-row .avatar` | size | `32x32px` |
| `.email-row .sender` | font | `13px` |
| `.email-row .subject` | font | `500 12.5px` |
| `.email-row .preview` | font | `11.5px, ink-muted` |
| `.email-row .meta` | font | `10.5px, ink-faint` |
| `.email-row.selected::before` | left bar | `2px, var(--ink)` |
| `.unread-dot` | `6x6px, var(--accent), 3px glow ring` |

### 4.3 Thread Column

| Element | Property | Value |
|---------|----------|-------|
| `.thread` | padding | `20px 28px 28px` |
| `.thread h2` | font | `600 20px, -0.015em tracking` |
| `.msg` | border | `1px solid var(--hairline-soft)` |
| `.msg` | radius | `var(--radius-card)` (14px) |
| `.msg` | background | `var(--surface)` |
| `.msg-head` | padding | `12px 14px` |
| `.msg-head .avatar` | size | `28x28px` |
| `.msg-head .from` | font | `600 12.5px` |
| `.msg-body` | padding | `16px 16px 16px 54px` |
| `.msg-body` | font | `13px, ink-2, 1.6 line-height` |

### 4.4 Reply Composer

| Element | Property | Value |
|---------|----------|-------|
| `.reply` | radius | `var(--radius-card)` |
| `.reply textarea` | padding | `14px 16px` |
| `.reply textarea` | min-height | `110px` |
| `.reply-foot` | background | `oklch(0.13 0.004 260)` (near-black) |
| `.reply-foot .icon-btn` | color | `white 50% opacity` |
| `.btn-primary` | background | `white` |
| `.btn-primary` | color | `oklch(0.15 0.01 280)` (dark) |

### 4.5 Jarvis Panel

| Element | Property | Value |
|---------|----------|-------|
| `.col-jarvis` | background | `color-mix(var(--shell), var(--accent-soft) 4%)` |
| `.jarvis-card` | radius | `var(--radius-card)` |
| `.jarvis-card.reply` | border | `1px solid var(--accent-soft)` |
| `.jarvis-card.reply` | background | `linear-gradient(var(--accent-soft) 0%, transparent 100%)` |
| `.jarvis-card.coach` | border | `1px solid var(--coach-soft)` |
| `.jarvis-card.coach` | background | `linear-gradient(var(--coach-soft) 0%, transparent 100%)` |
| `.jarvis-btn` | padding | `5px 10px` |
| `.jarvis-btn` | font | `500 11.5px` |
| `.jarvis-btn.primary` | background | `var(--accent)` |
| `.sub-card` | padding | `14px` |
| `.sub-card` | radius | `var(--radius-soft)` (10px) |
| `.sub-card h4` | font | `600 10.5px uppercase, 0.06em tracking` |

### 4.6 Resizable Columns

- Drag handles between columns (2px accent line on hover)
- `position: absolute`, `cursor: col-resize`
- Double-click to reset
- Persist widths in localStorage

**Files changed:** `app/PageClient.tsx`, `app/components/InboxComponents.tsx`, `app/globals.css`, NEW: `app/components/Resizer.tsx`

---

## Phase 5: Dashboard

**What:** Redesign dashboard to match prototype exactly

### 5.1 Key Elements

- Greeting: "Good morning, {Name} — {date}" with subtitle
- Jarvis briefing card with gradient top border
- 4 KPI cards with sparkline charts
- Revenue bar chart (dark bars)
- Pipeline funnel (horizontal stacked bars)
- Need reply table + Team leaderboard table

### 5.2 Key CSS

| Element | Property | Value |
|---------|----------|-------|
| `.page` | padding | `28px 32px` |
| `.page-title` | font | `600 22px, -0.02em tracking` |
| `.page-sub` | font | `12.5px, ink-muted` |
| `.kpi-grid` | gap | `14px`, `4 columns` |
| `.kpi-card` | padding | `16px 18px` |
| `.kpi-card` | radius | `var(--radius-card)` |
| `.kpi-card` | background | `var(--surface)` |
| `.kpi-card .label` | font | `500 11px uppercase, 0.04em tracking` |
| `.kpi-card .val` | font | `600 26px, -0.02em tracking` |
| `.kpi-card .delta` | font | `500 11px` |

**Files changed:** `app/dashboard/PageClient.tsx`, `app/globals.css`

---

## Phase 6: Compose Modal

**What:** Dark-footer compose modal matching prototype

### 6.1 Key CSS

| Element | Property | Value |
|---------|----------|-------|
| Modal overlay | background | `rgba(0,0,0,0.55)` |
| Modal overlay | backdrop-filter | `blur(8px)` |
| `.compose` | width | `660px` |
| `.compose` | radius | `var(--radius-card)` (14px) |
| `.compose` | shadow | `var(--shadow-pop)` |
| `.compose-head` | padding | `14px 18px` |
| `.compose-head` | border-bottom | `1px solid var(--hairline-soft)` |
| `.compose-foot` | background | `oklch(0.13 0.004 260)` (near-black) |
| `.from-pill` | background | `var(--surface-2)` |
| `.from-pill` | radius | `var(--radius-pill)` |

**Files changed:** `app/components/ComposeModal.tsx`, `app/globals.css`

---

## Phase 7: Campaigns, Pipeline, Analytics

### 7.1 Campaigns (screens.jsx)

- Status tabs, KPI strip, campaign table
- Status chips: running (coach), paused (warn), draft (ink-muted), completed (info)

### 7.2 Pipeline (screens.jsx)

- 6-column kanban board
- Card: avatar + name + company + value + date + stage chip
- Column headers with count badges

### 7.3 Analytics (screens_mkt.jsx)

- KPI grid, daily volume chart, response time distribution
- Account leaderboard, pipeline funnel

**Files changed:** `app/campaigns/PageClient.tsx`, `app/opportunities/PageClient.tsx`, `app/analytics/PageClient.tsx`, `app/globals.css`

---

## Phase 8: CRM Screens

### 8.1 Actions (screens_crm.jsx)

- Priority queue with color-coded bars (6px wide)
- Filter tabs: all, critical, high, med

### 8.2 Clients (screens_crm.jsx)

- List/Grid/Board views
- Detail drawer (520px, slides from right)
- Jarvis callout, stats grid, contact fields

### 8.3 Projects (screens_crm.jsx)

- Progress bars, budget tracking, editor assignment

### 8.4 Accounts (screens_crm.jsx)

- Health status, warmup bars, bounce rates

**Files changed:** `app/actions/PageClient.tsx`, `app/clients/PageClient.tsx`, `app/my-projects/PageClient.tsx`, `app/accounts/PageClient.tsx`, `app/globals.css`

---

## Phase 9: Admin Screens

### 9.1 Intelligence, Finance, Data Health, Team, Settings

All from `screens_admin.jsx` — each with specific layouts, KPI grids, tables.

### 9.2 Settings (most complex)

- Left sidebar nav (200px, sticky)
- 6 sections: Profile, Sync, Notifications, Jarvis, API keys, Billing
- Toggle switches (34x20px)
- Setting rows (label 180px + value)

**Files changed:** `app/intelligence/PageClient.tsx`, `app/finance/PageClient.tsx`, `app/data-health/PageClient.tsx`, `app/team/PageClient.tsx`, `app/settings/page.tsx`, `app/globals.css`

---

## Phase 10: Editor Role Screens (NEW)

### 10.1 New pages to create

| Page | URL | Source |
|------|-----|--------|
| Editor Dashboard (Today) | `/` (when role=editor) | `screens_editor.jsx` lines 130-279 |
| My Queue | `/queue` | lines 281-384 |
| Calendar | `/calendar` | lines 386-499 |
| Revisions | `/revisions` | lines 501-584 |
| Delivered | `/delivered` | lines 586-640 |
| Footage Library | `/footage` | lines 642-698 |
| Brand Guides | `/brand-guides` | lines 700-751 |
| Editor Templates | `/editor-templates` | lines 753-803 |

**Files changed:** 8 new page files, `app/components/Sidebar.tsx` (editor nav), `app/globals.css`

---

## Phase 11: Shared Components

### 11.1 Chips/Badges

```css
.chip { padding: 2px 8px; font: 500 11px; radius: 999px; }
.chip.cold { bg: info-soft; color: info; }
.chip.lead { bg: accent-soft; color: accent-ink; }
.chip.warm { bg: warn-soft; color: warn; }
.chip.closed { bg: coach-soft; color: coach; }
.chip.dead { bg: danger-soft; color: danger; }
```

### 11.2 Avatars

```css
.avatar { border-radius: 50%; display: grid; place-items: center; color: white; font-weight: 600; }
.av-a { background: linear-gradient(135deg, oklch(0.6 0.14 40), oklch(0.45 0.1 30)); }
.av-b { background: linear-gradient(135deg, oklch(0.55 0.14 280), oklch(0.4 0.1 270)); }
.av-c { background: linear-gradient(135deg, oklch(0.6 0.12 160), oklch(0.45 0.09 150)); }
/* ... 8 avatar gradient classes */
```

### 11.3 KPI Cards, Tables, Progress Bars

All from `styles.css` lines 700-1220.

---

## Execution Order (Priority)

| Order | Phase | Impact | Effort | Files |
|-------|-------|--------|--------|-------|
| 1 | **Phase 0** — CSS tokens | Everything changes | Medium | globals.css |
| 2 | **Phase 1** — Shell layout | Floating container | Low | layout.tsx, ClientLayout.tsx, globals.css |
| 3 | **Phase 2** — Sidebar | Most visible | Medium | Sidebar.tsx, globals.css |
| 4 | **Phase 4** — Inbox | Hero screen | High | PageClient.tsx, InboxComponents.tsx, globals.css |
| 5 | **Phase 3** — Topbar | Quick | Low | Topbar.tsx, globals.css |
| 6 | **Phase 6** — Compose | Modal polish | Medium | ComposeModal.tsx, globals.css |
| 7 | **Phase 5** — Dashboard | Key screen | Medium | dashboard/PageClient.tsx, globals.css |
| 8 | **Phase 7** — Marketing | 3 screens | Medium | campaigns, analytics, opportunities |
| 9 | **Phase 8** — CRM | 4 screens | High | actions, clients, projects, accounts |
| 10 | **Phase 9** — Admin | 5 screens | High | intel, finance, health, team, settings |
| 11 | **Phase 11** — Components | Chips, avatars | Low | globals.css |
| 12 | **Phase 10** — Editor | 8 new screens | Very High | 8 new files |

**Total files to modify:** ~25 existing files
**Total new files:** ~8 (editor screens)
**Total CSS to write:** ~1,200 lines (replacing portions of globals.css)
**Estimated effort:** 3-4 focused sessions

---

## Rules

1. Every color value comes from the design tokens — no hardcoded hex
2. Every spacing value extracted from the prototype — no guessing
3. Font: Inter only (not Google Sans, not Roboto)
4. Font size: 13.5px base (not 15px)
5. Border radius: 8px nav items, 10px soft, 14px cards, 20px shell (not 999px pills)
6. Dark mode is DEFAULT — light is the toggle option
7. Keep all existing functionality — this is a visual-only overhaul
8. Test each phase before moving to next
