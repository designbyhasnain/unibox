'use client'

import React, { useState } from 'react';

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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '12px', width: '400px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}>
                <h2 style={{ marginBottom: '1.5rem', fontWeight: 600 }}>Add New Lead</h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Full Name</label>
                        <input
                            type="text"
                            required
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white', outline: 'none' }}
                            value={name} onChange={e => setName(e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Email Address</label>
                        <input
                            type="email"
                            required
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white', outline: 'none' }}
                            value={email} onChange={e => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Source</label>
                        <select
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white', outline: 'none' }}
                            value={source} onChange={e => setSource(e.target.value)}
                        >
                            <option value="LinkedIn">LinkedIn</option>
                            <option value="Apollo">Apollo</option>
                            <option value="Referral">Referral</option>
                            <option value="Website">Website</option>
                            <option value="Cold Outreach">Cold Outreach</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Initial Notes</label>
                        <textarea
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'white', outline: 'none', resize: 'none', minHeight: '80px' }}
                            value={notes} onChange={e => setNotes(e.target.value)}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-color)', color: 'white', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--accent-primary)', border: 'none', color: 'white', fontWeight: 600, cursor: 'pointer' }}>Add Lead</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
