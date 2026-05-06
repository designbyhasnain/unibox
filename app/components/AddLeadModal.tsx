'use client'

import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { FormField, FormInput, FormSelect } from './ui/FormField';
import { createClientAction } from '../../src/actions/clientActions';
// Switched from getManagersAction (returns admins + managers + sales) to
// listSalesUsersAction so the AM picker matches the /clients table cell —
// SALES role only. Admins/account-managers don't appear in either picker
// because they're not outward-facing reps.
import { listSalesUsersAction, type SalesUser } from '../../src/actions/projectMetadataActions';
import { getCurrentUserAction } from '../../src/actions/authActions';
import { useDialogShell } from '../hooks/useDialogShell';
import { useGlobalFilter } from '../context/FilterContext';

interface AddLeadModalProps {
    onClose: () => void;
    onAddLead: (lead: any) => void;
    /** Optional pre-fetched SALES users from the parent. When provided the
     *  modal skips its own listSalesUsersAction call and the AM dropdown
     *  is populated instantly. /clients PageClient passes its already-
     *  loaded list here; standalone callers fall back to the in-modal
     *  fetch (unchanged behaviour). */
    presetSalesUsers?: SalesUser[];
    presetIsAdmin?: boolean;
}

export default function AddLeadModal({ onClose, onAddLead, presetSalesUsers, presetIsAdmin }: AddLeadModalProps) {
    const { dialogRef } = useDialogShell({ onClose });
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [company, setCompany] = useState('');
    const [phone, setPhone] = useState('');
    const [priority, setPriority] = useState('');
    const [estimatedValue, setEstimatedValue] = useState('');
    const [expectedCloseDate, setExpectedCloseDate] = useState('');
    const [pipelineStage, setPipelineStage] = useState('LEAD');
    // Health defaults to 'neutral' to match the inline-cell options in the
    // /clients table — created leads land in a neutral state until the rep
    // qualifies them.
    const [relationshipHealth, setRelationshipHealth] = useState('neutral');
    const [accountManagerId, setAccountManagerId] = useState('');
    // Gmail account ("source mailbox") this contact is associated with.
    // Optional — only set when the user wants to pre-attribute the lead
    // to a specific inbox before any email arrives.
    const [gmailAccountId, setGmailAccountId] = useState('');
    const { accounts: gmailAccounts } = useGlobalFilter();
    const [managers, setManagers] = useState<SalesUser[]>(presetSalesUsers ?? []);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    // SALES users can't pick another user as the AM (server enforces via the
    // mass-assignment guard in commit 2ef18b6); hide the dropdown for them
    // entirely so the team roster doesn't leak client-side.
    const [isAdmin, setIsAdmin] = useState<boolean | null>(presetIsAdmin ?? null);

    useEffect(() => {
        // Fast path: parent pre-fetched both pieces — skip the network roundtrip.
        if (presetIsAdmin !== undefined && presetSalesUsers !== undefined) return;
        getCurrentUserAction().then((u: any) => {
            const admin = u?.role === 'ADMIN' || u?.role === 'ACCOUNT_MANAGER';
            setIsAdmin(admin);
            if (admin && presetSalesUsers === undefined) {
                listSalesUsersAction()
                    .then(r => { if (r.success) setManagers(r.users); })
                    .catch(console.error);
            }
        }).catch(() => setIsAdmin(false));
    // intentionally not in deps — we only want this on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email) return;
        setIsSubmitting(true);
        setError('');

        try {
            const res = await createClientAction({
                name,
                email,
                company: company || undefined,
                phone: phone || undefined,
                priority: priority || undefined,
                estimated_value: estimatedValue ? parseFloat(estimatedValue) : undefined,
                expected_close_date: expectedCloseDate || undefined,
                pipeline_stage: pipelineStage,
                relationship_health: relationshipHealth || undefined,
                account_manager_id: accountManagerId || undefined,
                last_gmail_account_id: gmailAccountId || undefined,
            });

            if (res.success) {
                onAddLead(res.client);
            } else {
                setError(res.error || 'Failed to create client');
            }
        } catch {
            setError('Something went wrong');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div ref={dialogRef} className="modal-container" role="dialog" aria-modal="true" aria-labelledby="add-lead-title" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title" id="add-lead-title">New Client</h2>
                    </div>
                    <button type="button" onClick={onClose} className="modal-close-btn" aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">
                    {error && (
                        <div style={{ padding: '8px 12px', background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 6, fontSize: '0.8125rem', marginBottom: 4 }}>
                            {error}
                        </div>
                    )}

                    {/* Row 1: Name + Email */}
                    <div className="form-row">
                        <FormField label="FULL NAME" required>
                            <FormInput type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" />
                        </FormField>
                        <FormField label="EMAIL ADDRESS" required>
                            <FormInput type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="john@company.com" />
                        </FormField>
                    </div>

                    {/* Row 2: Company + Phone */}
                    <div className="form-row">
                        <FormField label="COMPANY">
                            <FormInput type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Inc." />
                        </FormField>
                        <FormField label="PHONE">
                            <FormInput type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 234-567-8900" />
                        </FormField>
                    </div>

                    {/* Row 3: Stage + Health (mirrors the inline cells in the
                        /clients table so the create flow and the edit flow
                        share vocabulary). */}
                    <div className="form-row">
                        <FormField label="STAGE">
                            <FormSelect value={pipelineStage} onChange={e => setPipelineStage(e.target.value)}>
                                {/* All 7 PipelineStage enum values from prisma/schema.prisma —
                                    CONTACTED and WARM_LEAD were missing before, leaving two
                                    real stages unreachable from the create flow. */}
                                <option value="COLD_LEAD">Cold Lead</option>
                                <option value="CONTACTED">Contacted</option>
                                <option value="WARM_LEAD">Warm Lead</option>
                                <option value="LEAD">Lead</option>
                                <option value="OFFER_ACCEPTED">Offer Accepted</option>
                                <option value="CLOSED">Closed</option>
                                <option value="NOT_INTERESTED">Not Interested</option>
                            </FormSelect>
                        </FormField>
                        <FormField label="HEALTH">
                            <FormSelect value={relationshipHealth} onChange={e => setRelationshipHealth(e.target.value)}>
                                {/* Same options as the table cell's SmartSelect. */}
                                <option value="neutral">neutral</option>
                                <option value="strong">strong</option>
                                <option value="warm">warm</option>
                                <option value="good">good</option>
                                <option value="cooling">cooling</option>
                                <option value="cold">cold</option>
                                <option value="at-risk">at-risk</option>
                                <option value="critical">critical</option>
                                <option value="dead">dead</option>
                            </FormSelect>
                        </FormField>
                    </div>

                    {/* Row 4: Priority + Estimated Value */}
                    <div className="form-row">
                        <FormField label="PRIORITY">
                            <FormSelect value={priority} onChange={e => setPriority(e.target.value)}>
                                <option value="">None</option>
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="URGENT">Urgent</option>
                            </FormSelect>
                        </FormField>
                        <FormField label="ESTIMATED VALUE ($)">
                            <FormInput type="number" value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} placeholder="50000" min="0" step="0.01" />
                        </FormField>
                    </div>

                    {/* Row 5: Expected close date + Account Manager (admin) */}
                    <div className="form-row">
                        <FormField label="EXPECTED CLOSE DATE">
                            <FormInput type="date" value={expectedCloseDate} onChange={e => setExpectedCloseDate(e.target.value)} />
                        </FormField>
                        {/* Account Manager — admin-only. SALES users are forced
                            to themselves server-side (mass-assignment guard,
                            commit 2ef18b6), so showing the dropdown to them
                            would just leak the team roster. The dropdown lists
                            ONLY users with role='SALES' (matching the inline
                            cell in the /clients table). */}
                        {isAdmin ? (
                            <FormField label="ACCOUNT MANAGER">
                                <FormSelect value={accountManagerId} onChange={e => setAccountManagerId(e.target.value)}>
                                    <option value="">Auto-assign (me)</option>
                                    {managers.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}{m.email ? ` · ${m.email}` : ''}</option>
                                    ))}
                                </FormSelect>
                            </FormField>
                        ) : (
                            <div /> /* keep grid alignment when AM is hidden */
                        )}
                    </div>

                    {/* Row 6: Gmail Account — which mailbox this contact
                        belongs to. Optional. Persisted as
                        contacts.last_gmail_account_id. Auto-set later when
                        the first email arrives if left empty here. */}
                    <FormField label="GMAIL ACCOUNT">
                        <FormSelect value={gmailAccountId} onChange={e => setGmailAccountId(e.target.value)}>
                            <option value="">Auto (set on first email)</option>
                            {gmailAccounts
                                .filter((a: any) => a.status === 'ACTIVE' || a.status === 'SYNCING' || !a.status)
                                .map((a: any) => (
                                    <option key={a.id} value={a.id}>
                                        {a.email}{a.manager_name ? ` · ${a.manager_name}` : ''}
                                    </option>
                                ))}
                        </FormSelect>
                    </FormField>

                    <div className="modal-actions">
                        <Button type="button" variant="secondary" onClick={onClose} className="modal-btn-cancel">
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" className="modal-btn-submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Adding...' : 'Add Client'}
                        </Button>
                    </div>
                </form>

                <style jsx>{`
                    .form-row {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 12px;
                    }
                `}</style>
            </div>
        </div>
    );
}
