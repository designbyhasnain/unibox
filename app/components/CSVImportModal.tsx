'use client';

import React, { useState, useRef, useCallback } from 'react';
import { previewCSVImportAction, importCSVAction, type ImportRow, type ImportPreview } from '../../src/actions/importActions';

interface CSVImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImportComplete: () => void;
}

function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0]!.split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = values[i] || ''; });
        return row;
    }).filter(r => Object.values(r).some(v => v));
}

function mapToImportRows(rows: Record<string, string>[]): ImportRow[] {
    return rows.map(r => ({
        email: r.email || r.mail || r['e-mail'] || r['email address'] || '',
        name: r.name || r['full name'] || r['first name'] || '',
        company: r.company || r.business || r['company name'] || '',
        website: r.website || r.url || r['website url'] || '',
        location: r.location || r.city || r.country || '',
        phone: r.phone || r.telephone || r.mobile || '',
    })).filter(r => r.email);
}

export default function CSVImportModal({ isOpen, onClose, onImportComplete }: CSVImportModalProps) {
    const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [result, setResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null);
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback(async (file: File) => {
        const text = await file.text();
        const parsed = parseCSV(text);
        const rows = mapToImportRows(parsed);
        if (rows.length === 0) { alert('No valid rows found'); return; }

        setStep('preview');
        const previewData = await previewCSVImportAction(rows);
        setPreview(previewData);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) handleFile(file);
    }, [handleFile]);

    const handleImport = async () => {
        if (!preview?.validRows.length) return;
        setStep('importing'); setProgress(0);

        const total = preview.validRows.length;
        const CHUNK = 50;
        let imported = 0, skipped = 0, errors = 0;

        for (let i = 0; i < total; i += CHUNK) {
            const chunk = preview.validRows.slice(i, i + CHUNK);
            const r = await importCSVAction(chunk);
            imported += r.imported; skipped += r.skipped; errors += r.errors;
            setProgress(Math.min(100, Math.round(((i + CHUNK) / total) * 100)));
        }

        setResult({ imported, skipped, errors });
        setStep('done');
    };

    const reset = () => {
        setStep('upload'); setPreview(null); setResult(null); setProgress(0);
        if (fileRef.current) fileRef.current.value = '';
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={() => { if (step !== 'importing') onClose(); }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
                <div className="modal-header">
                    <h2 className="modal-title">Import Prospects (CSV)</h2>
                    <button className="icon-btn" onClick={() => { if (step !== 'importing') onClose(); }} disabled={step === 'importing'}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                </div>

                <div style={{ padding: '1.5rem' }}>
                    {step === 'upload' && (
                        <div
                            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileRef.current?.click()}
                            style={{
                                border: `2px dashed ${isDragging ? '#1a73e8' : 'var(--border-subtle)'}`,
                                borderRadius: 12, padding: '3rem', textAlign: 'center', cursor: 'pointer',
                                background: isDragging ? 'rgba(26,115,232,0.05)' : 'transparent',
                                transition: 'all 0.2s',
                            }}
                        >
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" style={{ marginBottom: 12 }}>
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                            </svg>
                            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                                Drop CSV file here or click to browse
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                Columns: email (required), name, company, website, location, phone
                            </div>
                            <input ref={fileRef} type="file" accept=".csv" hidden
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                        </div>
                    )}

                    {step === 'preview' && preview && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                                <div style={{ background: '#e6f4ea', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#137333' }}>{preview.newCount}</div>
                                    <div style={{ fontSize: 11, color: '#137333' }}>New Contacts</div>
                                </div>
                                <div style={{ background: '#fef7e0', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#b06000' }}>{preview.duplicateCount}</div>
                                    <div style={{ fontSize: 11, color: '#b06000' }}>Duplicates (skip)</div>
                                </div>
                                <div style={{ background: '#fce8e6', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#c5221f' }}>{preview.invalidCount}</div>
                                    <div style={{ fontSize: 11, color: '#c5221f' }}>Invalid</div>
                                </div>
                            </div>

                            {preview.duplicates.length > 0 && (
                                <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--text-tertiary)' }}>
                                    <strong>Duplicates found:</strong>
                                    {preview.duplicates.slice(0, 5).map(d => (
                                        <div key={d.email} style={{ marginTop: 4 }}>
                                            {d.email} — already managed by <strong>{d.manager}</strong>
                                        </div>
                                    ))}
                                    {preview.duplicates.length > 5 && <div>...and {preview.duplicates.length - 5} more</div>}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary" onClick={reset}>Back</button>
                                <button className="btn btn-primary" onClick={handleImport} disabled={!preview.newCount}>
                                    Import {preview.newCount} Contacts
                                </button>
                            </div>
                        </>
                    )}

                    {step === 'importing' && (
                        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                            <div style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-primary)' }}>Importing contacts...</div>
                            <div style={{ background: 'var(--border-subtle)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                                <div style={{ background: '#1a73e8', height: '100%', width: `${progress}%`, transition: 'width 0.3s', borderRadius: 8 }} />
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>{progress}%</div>
                        </div>
                    )}

                    {step === 'done' && result && (
                        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" style={{ marginBottom: 12 }}>
                                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Import Complete</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                {result.imported} imported, {result.skipped} skipped, {result.errors} errors
                            </div>
                            <button className="btn btn-primary" onClick={() => { onImportComplete(); onClose(); reset(); }} style={{ marginTop: 16 }}>
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
