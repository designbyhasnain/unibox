import React, { useState, useEffect } from 'react';
import { createProjectAction, getManagersAction } from '../../src/actions/projectActions';

const ADMIN_USER_ID = '1ca1464d-1009-426e-96d5-8c5e8c84faac';

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
    const [accountManagerId, setAccountManagerId] = useState(ADMIN_USER_ID);
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
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                borderRadius: '16px', width: '500px', maxWidth: '95vw', padding: '2rem',
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)', animation: 'modalPop 0.2s ease-out',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>New Project</h2>
                        {client && (
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                                for {client.name || client.email}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.7 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Client info */}
                    {client ? (
                        <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Client:</span>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{client.name || client.email}</span>
                            <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>{client.email}</span>
                        </div>
                    ) : (
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
                                Client <span style={{ color: 'var(--accent-danger)' }}>*</span>
                            </label>
                            <select
                                value={selectedClientId}
                                onChange={e => setSelectedClientId(e.target.value)}
                                style={{
                                    width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                    borderRadius: '8px', padding: '0.6rem 0.9rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
                                }}
                            >
                                <option value="">Select a client...</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Project Name */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
                            Project Name <span style={{ color: 'var(--accent-danger)' }}>*</span>
                        </label>
                        <input
                            type="text"
                            value={projectName}
                            onChange={e => setProjectName(e.target.value)}
                            placeholder="e.g. Brand Video Q1 2025"
                            style={{
                                width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                borderRadius: '8px', padding: '0.6rem 0.9rem', color: 'var(--text-primary)',
                                fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.2s',
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                            onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                        />
                    </div>

                    {/* Date row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
                                Project Date <span style={{ color: 'var(--accent-danger)' }}>*</span>
                            </label>
                            <input
                                type="date"
                                value={projectDate}
                                onChange={e => setProjectDate(e.target.value)}
                                style={{
                                    width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                    borderRadius: '8px', padding: '0.6rem 0.9rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
                                    colorScheme: 'dark',
                                }}
                                onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
                                Due Date <span style={{ color: 'var(--accent-danger)' }}>*</span>
                            </label>
                            <input
                                type="date"
                                value={dueDate}
                                onChange={e => setDueDate(e.target.value)}
                                style={{
                                    width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                    borderRadius: '8px', padding: '0.6rem 0.9rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
                                    colorScheme: 'dark',
                                }}
                                onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                            />
                        </div>
                    </div>

                    {/* Manager & Priority */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
                                Account Manager
                            </label>
                            <select
                                value={accountManagerId}
                                onChange={e => setAccountManagerId(e.target.value)}
                                style={{
                                    width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                    borderRadius: '8px', padding: '0.6rem 0.9rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
                                }}
                            >
                                {managers.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
                                Priority
                            </label>
                            <select
                                value={priority}
                                onChange={e => setPriority(e.target.value)}
                                style={{
                                    width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                    borderRadius: '8px', padding: '0.6rem 0.9rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
                                }}
                            >
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="URGENT">Urgent</option>
                            </select>
                        </div>
                    </div>

                    {/* Quote */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
                            Quote / Budget (optional)
                        </label>
                        <div style={{ position: 'relative' }}>
                            <span style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>$</span>
                            <input
                                type="number"
                                value={quote}
                                onChange={e => setQuote(e.target.value)}
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                                style={{
                                    width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                    borderRadius: '8px', padding: '0.6rem 0.9rem 0.6rem 1.8rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
                                }}
                                onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                            />
                        </div>
                    </div>

                    {/* Brief */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 500 }}>
                            Brief (optional)
                        </label>
                        <textarea
                            value={brief}
                            onChange={e => setBrief(e.target.value)}
                            placeholder="Describe the project scope, deliverables, or any notes..."
                            rows={3}
                            style={{
                                width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
                                borderRadius: '8px', padding: '0.6rem 0.9rem', color: 'var(--text-primary)', fontSize: '0.9rem',
                                resize: 'vertical', outline: 'none', fontFamily: 'Inter, sans-serif',
                            }}
                            onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                            onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                        />
                    </div>

                    {error && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', color: 'var(--accent-danger)', fontSize: '0.85rem' }}>
                            {error}
                        </div>
                    )}

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
                            disabled={isSubmitting}
                            style={{
                                flex: 2, background: isSubmitting ? 'var(--bg-tertiary)' : 'var(--accent-primary)',
                                border: 'none', borderRadius: '8px', padding: '0.7rem',
                                color: 'white', fontWeight: 600, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                fontSize: '0.95rem', transition: 'background 0.2s',
                            }}
                        >
                            {isSubmitting ? 'Creating...' : 'Create Project'}
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
