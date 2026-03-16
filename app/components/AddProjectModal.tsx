'use client';

import React, { useState, useEffect } from 'react';
import { createProjectAction, getManagersAction } from '../../src/actions/projectActions';
import { DEFAULT_USER_ID } from '../constants/config';
import { Button } from './ui/Button';
import { FormField, FormInput, FormSelect, FormTextarea } from './ui/FormField';
import { ErrorAlert } from './ui/ErrorAlert';

interface AddProjectModalProps {
    client?: { id: string; name: string; email: string } | null;
    clients?: { id: string; name: string; email: string }[];
    onClose: () => void;
    onCreated: () => void;
    initialProjectName?: string;
    sourceEmailId?: string;
}

export default function AddProjectModal({ client, clients = [], onClose, onCreated, initialProjectName, sourceEmailId }: AddProjectModalProps) {
    const [projectName, setProjectName] = useState(initialProjectName || '');
    const [projectDate, setProjectDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState('');
    const [accountManagerId, setAccountManagerId] = useState(DEFAULT_USER_ID);
    const [priority, setPriority] = useState('MEDIUM');
    const [quote, setQuote] = useState('');
    const [brief, setBrief] = useState('');
    const [selectedClientId, setSelectedClientId] = useState(client ? client.id : '');
    const [managers, setManagers] = useState<{ id: string, name: string }[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        async function load() {
            const data = await getManagersAction();
            setManagers(data);
        }
        load();
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
            quote: quote ? parseFloat(quote) : undefined,
            brief: brief.trim() || undefined,
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
        <div className="modal-overlay">
            <div className="modal-container">
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title">New Project</h2>
                        {client && (
                            <p className="modal-subtitle">
                                for {client.name || client.email}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="modal-close-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">
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

                    {/* Project Name */}
                    <FormField label="PROJECT NAME" required>
                        <FormInput
                            type="text"
                            value={projectName}
                            onChange={e => setProjectName(e.target.value)}
                            placeholder="e.g. Brand Video Q1 2025"
                        />
                    </FormField>

                    {/* Date row */}
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

                    {/* Manager & Priority */}
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

                    {/* Quote */}
                    <FormField label="Quote / Budget (optional)">
                        <div className="apm-quote-wrapper">
                            <span className="apm-quote-prefix">$</span>
                            <FormInput
                                type="number"
                                value={quote}
                                onChange={e => setQuote(e.target.value)}
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                                className="apm-quote-input"
                            />
                        </div>
                    </FormField>

                    {/* Brief */}
                    <FormField label="BRIEF (OPTIONAL)">
                        <FormTextarea
                            value={brief}
                            onChange={e => setBrief(e.target.value)}
                            placeholder="Describe the project scope, deliverables, or any notes..."
                            rows={3}
                        />
                    </FormField>

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
