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
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', width: '520px', maxWidth: '95vw', padding: '2rem',
                boxShadow: 'var(--shadow-xl)', animation: 'modalPop 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>New Lead</h2>
                    </div>
                    <button type="button" onClick={onClose} style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', color: 'var(--text-muted)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                            FULL NAME <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <input
                            type="text"
                            required
                            value={name} onChange={e => setName(e.target.value)}
                            style={{
                                width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', color: 'var(--text-primary)',
                                fontSize: '0.9375rem', outline: 'none', transition: 'all 0.2s',
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                            EMAIL ADDRESS <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <input
                            type="email"
                            required
                            value={email} onChange={e => setEmail(e.target.value)}
                            style={{
                                width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', color: 'var(--text-primary)',
                                fontSize: '0.9375rem', outline: 'none', transition: 'all 0.2s',
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                            SOURCE
                        </label>
                        <select
                            value={source} onChange={e => setSource(e.target.value)}
                            style={{
                                width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', color: 'var(--text-primary)',
                                fontSize: '0.9375rem', outline: 'none', transition: 'all 0.2s',
                            }}
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
                        <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                            INITIAL NOTES (OPTIONAL)
                        </label>
                        <textarea
                            value={notes} onChange={e => setNotes(e.target.value)}
                            rows={3}
                            style={{
                                width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)', padding: '0.75rem 1rem', color: 'var(--text-primary)', fontSize: '0.9375rem',
                                resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border-color)',
                                borderRadius: '8px', padding: '0.7rem', color: 'var(--text-primary)', fontWeight: 500, cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={{
                                flex: 2, background: 'var(--accent-primary)',
                                border: 'none', borderRadius: '8px', padding: '0.7rem',
                                color: 'white', fontWeight: 600, cursor: 'pointer',
                                fontSize: '0.95rem', transition: 'background 0.2s',
                            }}
                        >
                            Add Lead
                        </button>
                    </div>
                </form>
            </div>
            <style>{`
                @keyframes modalPop {
                    from { opacity: 0; transform: scale(0.96) translateY(8px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
        </div>
    );
}
