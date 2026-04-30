'use client';

import React, { useState, useEffect } from 'react';
import { createProjectAction, getManagersAction } from '../../src/actions/projectActions';
import { DEFAULT_USER_ID } from '../constants/config';
import { Button } from './ui/Button';
import { FormField, FormInput, FormSelect, FormTextarea } from './ui/FormField';
import { ErrorAlert } from './ui/ErrorAlert';
import { useDialogShell } from '../hooks/useDialogShell';

interface AddProjectModalProps {
    client?: { id: string; name: string; email: string } | null;
    clients?: { id: string; name: string; email: string }[];
    onClose: () => void;
    onCreated: () => void;
    initialProjectName?: string;
    sourceEmailId?: string;
}

export default function AddProjectModal({ client, clients = [], onClose, onCreated, initialProjectName, sourceEmailId }: AddProjectModalProps) {
    const { dialogRef } = useDialogShell({ onClose });
    const [projectName, setProjectName] = useState(initialProjectName || '');
    const [projectDate, setProjectDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState('');
    const [accountManagerId, setAccountManagerId] = useState(DEFAULT_USER_ID);
    const [priority, setPriority] = useState('MEDIUM');
    const [paidStatus, setPaidStatus] = useState('UNPAID');
    const [finalReview, setFinalReview] = useState('PENDING');
    const [quote, setQuote] = useState('');
    const [projectValue, setProjectValue] = useState('');
    const [projectLink, setProjectLink] = useState('');
    const [brief, setBrief] = useState('');
    const [reference, setReference] = useState('');
    const [deductionOnDelay, setDeductionOnDelay] = useState('');
    const [selectedClientId, setSelectedClientId] = useState(client ? client.id : '');
    const [managers, setManagers] = useState<{ id: string, name: string }[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        async function load() {
            const data = await getManagersAction();
            setManagers(data);
            // If the default-from-env was a stale ID (and managers don't include
            // it), pick the first manager as a sensible default.
            if (data.length > 0 && !data.some((m: any) => m.id === accountManagerId)) {
                setAccountManagerId(data[0]!.id);
            }
        }
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectName.trim() || !projectDate || !dueDate || (!client && !selectedClientId)) {
            setError('Project name, client, project date, and due date are required.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        const result = await createProjectAction({
            clientId: client ? client.id : selectedClientId,
            projectName: projectName.trim(),
            projectDate: new Date(projectDate).toISOString(),
            dueDate: new Date(dueDate).toISOString(),
            accountManagerId,
            priority,
            paidStatus,
            finalReview,
            quote: quote ? parseFloat(quote) : null,
            projectValue: projectValue ? parseFloat(projectValue) : null,
            projectLink: projectLink.trim() || null,
            brief: brief.trim() || null,
            reference: reference.trim() || null,
            deductionOnDelay: deductionOnDelay ? parseFloat(deductionOnDelay) : null,
            sourceEmailId
        });

        setIsSubmitting(false);
        if (result.success) {
            onCreated();
        } else {
            setError(result.error || 'Failed to create project. Please try again.');
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div ref={dialogRef} className="modal-container apm-modal-expanded" role="dialog" aria-modal="true" aria-labelledby="add-project-title" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title" id="add-project-title">New Project</h2>
                        {client && (
                            <p className="modal-subtitle">
                                for {client.name || client.email}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="modal-close-btn" aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-form apm-form-scrollable">
                    <div className="apm-form-section">
                        <h3 className="apm-section-title">Core Information</h3>
                        {/* Client info */}
                        {client ? (
                            <div className="apm-client-info">
                                <span className="apm-client-label">CLIENT</span>
                                <span className="apm-client-name">{client.name || client.email}</span>
                                <span className="apm-client-email">{client.email}</span>
                            </div>
                        ) : (
                            <FormField label="CLIENT" required>
                                <FormSelect
                                    value={selectedClientId}
                                    onChange={e => setSelectedClientId(e.target.value)}
                                >
                                    <option value="">Select a client...</option>
                                    {clients.map(c => (
                                        <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                                    ))}
                                </FormSelect>
                            </FormField>
                        )}

                        <FormField label="PROJECT NAME" required>
                            <FormInput
                                type="text"
                                value={projectName}
                                onChange={e => setProjectName(e.target.value)}
                                placeholder="e.g. Brand Video Q1 2025"
                            />
                        </FormField>

                        <div className="modal-grid-row">
                            <FormField label="Project Date" required>
                                <FormInput
                                    type="date"
                                    value={projectDate}
                                    onChange={e => setProjectDate(e.target.value)}
                                />
                            </FormField>
                            <FormField label="Due Date" required>
                                <FormInput
                                    type="date"
                                    value={dueDate}
                                    onChange={e => setDueDate(e.target.value)}
                                />
                            </FormField>
                        </div>
                    </div>

                    <div className="apm-form-section">
                        <h3 className="apm-section-title">Management & Status</h3>
                        <div className="modal-grid-row">
                            <FormField label="Account Manager">
                                <FormSelect
                                    value={accountManagerId}
                                    onChange={e => setAccountManagerId(e.target.value)}
                                >
                                    {managers.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </FormSelect>
                            </FormField>
                            <FormField label="Priority">
                                <FormSelect
                                    value={priority}
                                    onChange={e => setPriority(e.target.value)}
                                >
                                    <option value="LOW">Low</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="HIGH">High</option>
                                    <option value="URGENT">Urgent</option>
                                </FormSelect>
                            </FormField>
                        </div>

                        <div className="modal-grid-row">
                            <FormField label="Paid Status">
                                <FormSelect
                                    value={paidStatus}
                                    onChange={e => setPaidStatus(e.target.value)}
                                >
                                    <option value="UNPAID">Unpaid</option>
                                    <option value="PARTIAL">Partial</option>
                                    <option value="PAID">Paid</option>
                                    <option value="OVERDUE">Overdue</option>
                                </FormSelect>
                            </FormField>
                            <FormField label="Final Review">
                                <FormSelect
                                    value={finalReview}
                                    onChange={e => setFinalReview(e.target.value)}
                                >
                                    <option value="PENDING">Pending</option>
                                    <option value="REVIEWING">Reviewing</option>
                                    <option value="APPROVED">Approved</option>
                                    <option value="REJECTED">Rejected</option>
                                </FormSelect>
                            </FormField>
                        </div>
                    </div>

                    <div className="apm-form-section">
                        <h3 className="apm-section-title">Financials & Links</h3>
                        <div className="modal-grid-row">
                            <FormField label="Quote ($)">
                                <FormInput
                                    type="number"
                                    value={quote}
                                    onChange={e => setQuote(e.target.value)}
                                    placeholder="0.00"
                                    step="0.01"
                                />
                            </FormField>
                            <FormField label="Project Value ($)">
                                <FormInput
                                    type="number"
                                    value={projectValue}
                                    onChange={e => setProjectValue(e.target.value)}
                                    placeholder="0.00"
                                    step="0.01"
                                />
                            </FormField>
                        </div>

                        <div className="modal-grid-row">
                            <FormField label="Project Link">
                                <FormInput
                                    type="url"
                                    value={projectLink}
                                    onChange={e => setProjectLink(e.target.value)}
                                    placeholder="https://..."
                                />
                            </FormField>
                            <FormField label="Deduction on Delay ($)">
                                <FormInput
                                    type="number"
                                    value={deductionOnDelay}
                                    onChange={e => setDeductionOnDelay(e.target.value)}
                                    placeholder="0.00"
                                    step="0.01"
                                />
                            </FormField>
                        </div>
                    </div>

                    <div className="apm-form-section">
                        <h3 className="apm-section-title">Notes & Reference</h3>
                        <FormField label="Reference / Referral">
                            <FormInput
                                type="text"
                                value={reference}
                                onChange={e => setReference(e.target.value)}
                                placeholder="Where did this project come from?"
                            />
                        </FormField>

                        <FormField label="BRIEF">
                            <FormTextarea
                                value={brief}
                                onChange={e => setBrief(e.target.value)}
                                placeholder="Describe the project scope, deliverables, or any notes..."
                                rows={3}
                            />
                        </FormField>
                    </div>

                    {error && (
                        <ErrorAlert message={error} onDismiss={() => setError('')} />
                    )}

                    <div className="modal-actions">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={onClose}
                            className="modal-btn-cancel"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            loading={isSubmitting}
                            className="modal-btn-submit"
                        >
                            {isSubmitting ? 'Creating...' : 'Create Project'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
