'use client'

import React, { useState } from 'react';
import { Button } from './ui/Button';
import { FormField, FormInput, FormSelect, FormTextarea } from './ui/FormField';

interface AddLeadModalProps {
    onClose: () => void;
    onAddLead: (lead: any) => void;
}

export default function AddLeadModal({ onClose, onAddLead }: AddLeadModalProps) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [source, setSource] = useState('LinkedIn');
    const [notes, setNotes] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email) return;

        onAddLead({
            id: Date.now(),
            name,
            email,
            source,
            stage: 'LEAD',
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
            unread: false,
            notes,
        });

        onClose();
    };

    return (
        <div className="modal-overlay">
            <div className="modal-container">
                <div className="modal-header">
                    <div>
                        <h2 className="modal-title">New Lead</h2>
                    </div>
                    <button type="button" onClick={onClose} className="modal-close-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">
                    <FormField label="FULL NAME" required>
                        <FormInput
                            type="text"
                            required
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </FormField>
                    <FormField label="EMAIL ADDRESS" required>
                        <FormInput
                            type="email"
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </FormField>
                    <FormField label="SOURCE">
                        <FormSelect
                            value={source}
                            onChange={e => setSource(e.target.value)}
                        >
                            <option value="LinkedIn">LinkedIn</option>
                            <option value="Apollo">Apollo</option>
                            <option value="Referral">Referral</option>
                            <option value="Website">Website</option>
                            <option value="Cold Outreach">Cold Outreach</option>
                            <option value="Other">Other</option>
                        </FormSelect>
                    </FormField>
                    <FormField label="INITIAL NOTES (OPTIONAL)">
                        <FormTextarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={3}
                        />
                    </FormField>

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
                            className="modal-btn-submit"
                        >
                            Add Lead
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
