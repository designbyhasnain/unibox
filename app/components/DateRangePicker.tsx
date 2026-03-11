'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { useGlobalFilter } from '../context/FilterContext';

export default function DateRangePicker() {
    const { startDate, setStartDate, endDate, setEndDate } = useGlobalFilter();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const presets = [
        { label: 'Today', days: 0 },
        { label: 'Yesterday', days: 1 },
        { label: 'Last 7 Days', days: 7 },
        { label: 'Last 30 Days', days: 30 },
        { label: 'This Year', type: 'year' },
    ];

    const handlePresetClick = (preset: any) => {
        const end = new Date();
        const start = new Date();

        if (preset.type === 'year') {
            start.setMonth(0, 1); // Jan 1st
        } else if (preset.label === 'Yesterday') {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else {
            start.setDate(start.getDate() - preset.days);
        }

        setStartDate(start.toISOString().split('T')[0] as string);
        setEndDate(end.toISOString().split('T')[0] as string);
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const formatDisplayDate = (dateStr: string) => {
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        return new Date(dateStr).toLocaleDateString('en-US', options);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative' }}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="btn btn-secondary"
                style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    padding: '6px 16px',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--accent)',
                    color: 'var(--text-primary)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}
            >
                <Calendar size={14} style={{ color: 'var(--accent)' }} />
                <span>{formatDisplayDate(startDate)} — {formatDisplayDate(endDate)}</span>
                <ChevronDown size={14} style={{ opacity: 0.5 }} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 8px)',
                            left: 0,
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                            zIndex: 100,
                            padding: '16px',
                            minWidth: '320px',
                            display: 'flex',
                            gap: '16px'
                        }}
                    >
                        {/* Presets */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderRight: '1px solid var(--border)', paddingRight: '16px' }}>
                            {presets.map(p => (
                                <button
                                    key={p.label}
                                    onClick={() => handlePresetClick(p)}
                                    style={{
                                        padding: '8px 12px',
                                        textAlign: 'left',
                                        borderRadius: '6px',
                                        fontSize: '0.8rem',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: 'var(--text-secondary)',
                                        transition: 'all 0.2s',
                                        whiteSpace: 'nowrap'
                                    }}
                                    className="hover-bg"
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* Custom Inputs */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>From</label>
                                <input 
                                    type="date" 
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    style={{
                                        padding: '8px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        width: '100%'
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>To</label>
                                <input 
                                    type="date" 
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    style={{
                                        padding: '8px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        fontSize: '0.85rem',
                                        outline: 'none',
                                        width: '100%'
                                    }}
                                />
                            </div>
                            <button 
                                onClick={() => setIsOpen(false)}
                                className="btn btn-primary"
                                style={{ marginTop: '8px', padding: '8px' }}
                            >
                                Apply Range
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx>{`
                .hover-bg:hover {
                    background: var(--bg-base) !important;
                    color: var(--accent) !important;
                }
            `}</style>
        </div>
    );
}
