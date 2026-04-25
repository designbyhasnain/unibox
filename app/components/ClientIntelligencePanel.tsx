'use client';

import React from 'react';
import type { ClientIntelligenceProfile, ClientAlert, TimelineEvent } from '../../src/types/clientIntelligence';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$( n: number | null | undefined ): string {
    if (n == null) return '—';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate( iso: string | null | undefined ): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return '—'; }
}

function relDate( iso: string | null | undefined ): string {
    if (!iso) return '';
    try {
        const diff = Date.now() - new Date(iso).getTime();
        const d = Math.floor(diff / 86400000);
        if (d === 0) return 'Today';
        if (d === 1) return 'Yesterday';
        if (d < 7)   return `${d}d ago`;
        if (d < 30)  return `${Math.round(d / 7)}w ago`;
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return ''; }
}

function progressLabel( prog: string ): string {
    const map: Record<string, string> = {
        ON_HOLD: 'On Hold', IN_PROGRESS: 'In Progress',
        DOWNLOADING: 'Downloading', DOWNLOADED: 'Downloaded',
        IN_REVISION: 'In Revision', APPROVED: 'Approved', DONE: 'Done',
    };
    return map[prog] ?? prog;
}

function stageLabel( s: string ): string {
    const map: Record<string, string> = {
        COLD_LEAD: 'Cold Lead', CONTACTED: 'Contacted',
        WARM_LEAD: 'Warm Lead', LEAD: 'Lead',
        OFFER_ACCEPTED: 'Offer Accepted', CLOSED: 'Closed', NOT_INTERESTED: 'Not Interested',
    };
    return map[s] ?? s;
}

function tierLabel( t: string ): string {
    return { NEW: 'New', STARTER: 'Starter', STANDARD: 'Standard', PREMIUM: 'Premium' }[t] ?? t;
}

// ─── Alert Row ─────────────────────────────────────────────────────────────────
function AlertRow({ alert }: { alert: ClientAlert }) {
    const icons: Record<string, string> = {
        critical: '🔴', warning: '🟡', info: '🔵', success: '🟢',
    };
    return (
        <div className={`ci-alert ci-alert--${alert.severity}`}>
            <span className="ci-alert-icon">{icons[alert.severity] ?? '⚪'}</span>
            <span className="ci-alert-msg">{alert.message}</span>
        </div>
    );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ pct }: { pct: number; progress: string }) {
    const warn = pct < 25;
    const done = pct >= 80;
    const cls  = done ? 'good' : warn ? 'warn' : '';
    return (
        <div className={`ci-progress-bar ${cls}`}>
            <span style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
    );
}

// ─── Timeline Event Row ───────────────────────────────────────────────────────
function TimelineRow({ event }: { event: TimelineEvent }) {
    return (
        <div className={`ci-timeline-row ${event.isPayment ? 'ci-timeline-row--payment' : ''}`}>
            <div className="ci-timeline-dot" />
            <div className="ci-timeline-body">
                <span className="ci-timeline-label">
                    {event.label}
                    {event.isPayment && event.amount ? (
                        <span className="ci-timeline-amount"> +{fmt$(event.amount)}</span>
                    ) : null}
                </span>
                <span className="ci-timeline-date">{relDate(event.date)}</span>
            </div>
        </div>
    );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
interface Props {
    profile: ClientIntelligenceProfile;
    isLoading: boolean;
    onSendReminder?: () => void;
    onInvoice?: () => void;
}

export default function ClientIntelligencePanel({ profile, isLoading, onSendReminder, onInvoice }: Props) {
    const [expandedProjects, setExpandedProjects] = React.useState(false);

    if (isLoading) {
        return (
            <div className="ci-panel">
                <div className="ci-skeleton" />
                <div className="ci-skeleton ci-skeleton--short" />
                <div className="ci-skeleton" />
                <div className="ci-skeleton ci-skeleton--short" />
            </div>
        );
    }

    const { finance, relationship, production, alerts, timeline, tier } = profile;

    // Only show warning+ alerts in the top alert strip
    const highAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'warning');
    const infoAlerts = alerts.filter(a => a.severity === 'info' || a.severity === 'success');

    const primaryProject = production.primaryProject;
    const extraProjects  = production.activeProjects.slice(1);

    const clientSinceFormatted = profile.finance.clientSince
        ? (() => {
            try {
                return new Date(profile.finance.clientSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            } catch { return profile.finance.clientSince; }
          })()
        : null;

    return (
        <div className="ci-panel">
            {/* ── Identity header ────────────────────────────────────────────── */}
            <div className="ci-identity">
                <div className="ci-identity-meta">
                    <div className="ci-name">{profile.name}</div>
                    {profile.company && <div className="ci-company">{profile.company}</div>}
                    <div className="ci-identity-badges">
                        <span className={`ci-tier-badge ci-tier--${tier.toLowerCase()}`}>
                            {tier === 'PREMIUM' ? '★ ' : ''}{tierLabel(tier)}
                        </span>
                        <span className={`ci-stage-badge ci-stage--${profile.stage.toLowerCase()}`}>
                            {stageLabel(profile.stage)}
                        </span>
                        {clientSinceFormatted && (
                            <span className="ci-since">Since {clientSinceFormatted}</span>
                        )}
                    </div>
                </div>
                <a
                    className="ci-profile-link"
                    href={`/clients/${profile.contactId}`}
                    title="View full profile"
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                </a>
            </div>

            {/* ── High-severity alerts ────────────────────────────────────────── */}
            {highAlerts.length > 0 && (
                <div className="ci-alerts-strip">
                    {highAlerts.slice(0, 3).map((a, i) => <AlertRow key={i} alert={a} />)}
                </div>
            )}

            {/* ── FINANCES ───────────────────────────────────────────────────── */}
            <div className="sub-card ci-section">
                <h4>Finances</h4>
                <div className="ci-finance-grid">
                    <div className="ci-finance-cell">
                        <span className="ci-finance-label">Total</span>
                        <span className="ci-finance-value">{fmt$(finance.totalRevenue)}</span>
                    </div>
                    <div className="ci-finance-cell">
                        <span className="ci-finance-label">Paid</span>
                        <span className="ci-finance-value ci-finance-value--paid">{fmt$(finance.paidRevenue)}</span>
                    </div>
                    <div className="ci-finance-cell">
                        <span className="ci-finance-label">Unpaid</span>
                        <span className={`ci-finance-value ${finance.hasUnpaid ? 'ci-finance-value--unpaid' : ''}`}>
                            {fmt$(finance.unpaidAmount)}
                        </span>
                    </div>
                </div>
                {finance.totalProjects > 0 && (
                    <div className="kv" style={{ marginTop: 8 }}>
                        <span className="k">Projects</span>
                        <span className="v">{finance.totalProjects} · avg {fmt$(finance.avgProjectValue)}</span>
                    </div>
                )}
                <div className="ci-finance-actions">
                    <button className="ci-action-btn" onClick={onSendReminder} title="Send payment reminder">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                        Send Reminder
                    </button>
                    <button className="ci-action-btn" onClick={onInvoice} title="Send invoice">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        Invoice
                    </button>
                </div>
            </div>

            {/* ── PRODUCTION ─────────────────────────────────────────────────── */}
            {production.matchMethod !== 'NONE' && primaryProject && (
                <div className="sub-card ci-section">
                    <h4>Production</h4>

                    {/* Primary project */}
                    <div className="ci-project">
                        <div className="ci-project-name">
                            {primaryProject.name}
                            {primaryProject.amReview === 'HAS_ISSUE' && (
                                <span className="ci-project-flag" title="AM review issue">⚠</span>
                            )}
                        </div>

                        <div className="ci-project-progress-row">
                            <ProgressBar pct={primaryProject.percentComplete} progress={primaryProject.progress} />
                            <span className="ci-project-pct">{primaryProject.percentComplete}%</span>
                        </div>

                        <div className="ci-project-meta-grid">
                            <div className="kv">
                                <span className="k">Status</span>
                                <span className="v">{progressLabel(primaryProject.progress)}</span>
                            </div>
                            {primaryProject.dueDate && (
                                <div className="kv">
                                    <span className="k">Due</span>
                                    <span className={`v ${new Date(primaryProject.dueDate) < new Date() ? 'ci-overdue' : ''}`}>
                                        {fmtDate(primaryProject.dueDate)}
                                    </span>
                                </div>
                            )}
                            {primaryProject.editor && (
                                <div className="kv">
                                    <span className="k">Editor</span>
                                    <span className="v">{primaryProject.editor}</span>
                                </div>
                            )}
                            {primaryProject.accountManager && (
                                <div className="kv">
                                    <span className="k">PM</span>
                                    <span className="v">{primaryProject.accountManager}</span>
                                </div>
                            )}
                            {primaryProject.sizeInGbs && (
                                <div className="kv">
                                    <span className="k">Footage</span>
                                    <span className="v">{primaryProject.sizeInGbs} GB</span>
                                </div>
                            )}
                        </div>

                        {primaryProject.tags.length > 0 && (
                            <div className="ci-tags">
                                {primaryProject.tags.map((tag, i) => (
                                    <span key={i} className="ci-tag">{tag}</span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Extra projects */}
                    {extraProjects.length > 0 && (
                        <div className="ci-more-projects">
                            <button
                                className="ci-more-btn"
                                onClick={() => setExpandedProjects(p => !p)}
                            >
                                {expandedProjects ? '▾' : '▸'} {extraProjects.length} more project{extraProjects.length > 1 ? 's' : ''}
                            </button>
                            {expandedProjects && (
                                <div className="ci-extra-projects">
                                    {extraProjects.map(p => (
                                        <div key={p.id} className="ci-extra-project">
                                            <span className="ci-extra-project-name">{p.name}</span>
                                            <span className="ci-extra-project-meta">{progressLabel(p.progress)} · {p.dueDate ? fmtDate(p.dueDate) : 'no date'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {production.matchMethod === 'NAME' && (
                        <div className="ci-match-note">Matched by name — verify client</div>
                    )}
                </div>
            )}

            {/* ── Info alerts (below production) ─────────────────────────────── */}
            {infoAlerts.length > 0 && (
                <div className="ci-alerts-strip ci-alerts-strip--info">
                    {infoAlerts.map((a, i) => <AlertRow key={i} alert={a} />)}
                </div>
            )}

            {/* ── TIMELINE ───────────────────────────────────────────────────── */}
            {timeline.length > 0 && (
                <div className="sub-card ci-section">
                    <h4>Timeline</h4>
                    <div className="ci-timeline">
                        {timeline.map((event, i) => (
                            <TimelineRow key={i} event={event} />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Relationship footer ─────────────────────────────────────────── */}
            <div className="ci-rel-footer">
                <div className="kv">
                    <span className="k">Health</span>
                    <span className={`v ci-health ci-health--${relationship.health}`}>
                        {relationship.health.charAt(0).toUpperCase() + relationship.health.slice(1)}
                    </span>
                </div>
                <div className="kv">
                    <span className="k">Emails</span>
                    <span className="v">{relationship.totalEmailsSent + relationship.totalEmailsReceived} total · {relationship.totalEmailsSent} sent · {relationship.totalEmailsReceived} recv</span>
                </div>
                {relationship.daysSinceLastContact != null && (
                    <div className="kv">
                        <span className="k">Last contact</span>
                        <span className="v">{relationship.daysSinceLastContact === 0 ? 'Today' : `${relationship.daysSinceLastContact}d ago`}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
