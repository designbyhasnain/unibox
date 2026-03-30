'use client'

import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { FormField, FormInput, FormSelect } from './ui/FormField';
import { createClientAction } from '../../src/actions/clientActions';
import { getManagersAction } from '../../src/actions/projectActions';

interface AddLeadModalProps {
    onClose: () => void;
    onAddLead: (lead: any) => void;
}

export default function AddLeadModal({ onClose, onAddLead }: AddLeadModalProps) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [company, setCompany] = useState('');
    const [phone, setPhone] = useState('');
    const [priority, setPriority] = useState('');
    const [estimatedValue, setEstimatedValue] = useState('');
    const [expectedCloseDate, setExpectedCloseDate] = useState('');
    const [pipelineStage, setPipelineStage] = useState('LEAD');
    const [accountManagerId, setAccountManagerId] = useState('');
    const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        getManagersAction().then(setManagers).catch(console.error);
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
                account_manager_id: accountManagerId || undefined,
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
        <div className="modal-overlay">
            <div className="modal-container" style={{ maxWidth: 540 }}>
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title">New Client</h2>
                    </div>
                    <button type="button" onClick={onClose} className="modal-close-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">
                    {error && (
                        <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 6, fontSize: '0.8125rem', marginBottom: 4 }}>
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

                    {/* Row 3: Status + Priority */}
                    <div className="form-row">
                        <FormField label="STATUS">
                            <FormSelect value={pipelineStage} onChange={e => setPipelineStage(e.target.value)}>
                                <option value="LEAD">Lead</option>
                                <option value="COLD_LEAD">Cold Lead</option>
                                <option value="OFFER_ACCEPTED">Offer Accepted</option>
                                <option value="CLOSED">Closed</option>
                                <option value="NOT_INTERESTED">Not Interested</option>
                            </FormSelect>
                        </FormField>
                        <FormField label="PRIORITY">
                            <FormSelect value={priority} onChange={e => setPriority(e.target.value)}>
                                <option value="">None</option>
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="URGENT">Urgent</option>
                            </FormSelect>
                        </FormField>
                    </div>

                    {/* Row 4: Estimated Value + Expected Close */}
                    <div className="form-row">
                        <FormField label="ESTIMATED VALUE ($)">
                            <FormInput type="number" value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} placeholder="50000" min="0" step="0.01" />
                        </FormField>
                        <FormField label="EXPECTED CLOSE DATE">
                            <FormInput type="date" value={expectedCloseDate} onChange={e => setExpectedCloseDate(e.target.value)} />
                        </FormField>
                    </div>

                    {/* Row 5: Account Manager */}
                    <FormField label="ACCOUNT MANAGER">
                        <FormSelect value={accountManagerId} onChange={e => setAccountManagerId(e.target.value)}>
                            <option value="">Auto-assign (me)</option>
                            {managers.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
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
