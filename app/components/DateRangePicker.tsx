'use client';

import React, { useState, useRef, useEffect } from 'react';
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
        // Parse manually to avoid timezone offset issues with YYYY-MM-DD strings (FE-042)
        const parts = dateStr.split('-').map(Number);
        const date = new Date(parts[0] ?? 0, (parts[1] ?? 1) - 1, parts[2] ?? 1);
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    };

    return (
        <div ref={containerRef} className="drp-container">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="btn btn-secondary drp-trigger"
                aria-label="Select date range"
            >
                <Calendar size={14} className="drp-calendar-icon" />
                <span>{formatDisplayDate(startDate)} — {formatDisplayDate(endDate)}</span>
                <ChevronDown size={14} className="drp-chevron" />
            </button>

            {isOpen && (
                    <div className="drp-dropdown drp-dropdown-enter">

                        {/* Presets */}
                        <div className="drp-presets" role="listbox" aria-label="Date range presets">
                            {presets.map(p => (
                                <button
                                    key={p.label}
                                    onClick={() => handlePresetClick(p)}
                                    className="drp-preset-btn"
                                    role="option"
                                    aria-selected={false}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* Custom Inputs */}
                        <div className="drp-custom">
                            <div className="drp-field">
                                <label className="drp-label">From</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="drp-date-input"
                                    aria-label="Start date"
                                />
                            </div>
                            <div className="drp-field">
                                <label className="drp-label">To</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="drp-date-input"
                                    aria-label="End date"
                                />
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="btn btn-primary drp-apply-btn"
                            >
                                Apply Range
                            </button>
                        </div>
                    </div>
                )}

            <style jsx global>{`
                .drp-container {
                    position: relative;
                }
                .drp-trigger {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 16px;
                    border-radius: 20px;
                    font-size: 0.85rem;
                    font-weight: 500;
                    background: var(--bg-surface);
                    border: 1px solid var(--accent);
                    color: var(--text-primary);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }
                .drp-calendar-icon {
                    color: var(--accent);
                }
                .drp-chevron {
                    opacity: 0.5;
                }
                .drp-dropdown-enter {
                    animation: drpSlideIn 0.2s ease-out;
                }
                @keyframes drpSlideIn {
                    from { opacity: 0; transform: translateY(10px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .drp-dropdown {
                    position: absolute;
                    top: calc(100% + 8px);
                    left: 0;
                    right: auto;
                    background: var(--bg-surface);
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                    z-index: 100;
                    padding: 16px;
                    min-width: 320px;
                    max-width: calc(100vw - 32px);
                    display: flex;
                    gap: 16px;
                }
                .drp-presets {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    border-right: 1px solid var(--border);
                    padding-right: 16px;
                }
                .drp-preset-btn {
                    padding: 8px 12px;
                    text-align: left;
                    border-radius: 6px;
                    font-size: 0.8rem;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    color: var(--text-secondary);
                    transition: all 0.2s;
                    white-space: nowrap;
                }
                .drp-preset-btn:hover {
                    background: var(--bg-base);
                    color: var(--accent);
                }
                .drp-custom {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    flex: 1;
                }
                .drp-field {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .drp-label {
                    font-size: 0.75rem;
                    color: var(--text-muted);
                }
                .drp-date-input {
                    padding: 8px;
                    border-radius: 8px;
                    border: 1px solid var(--border);
                    font-size: 0.85rem;
                    outline: none;
                    width: 100%;
                }
                .drp-apply-btn {
                    margin-top: 8px;
                    padding: 8px;
                }
                @media (max-width: 480px) {
                    .drp-dropdown {
                        left: 50%;
                        transform: translateX(-50%);
                        flex-direction: column;
                        min-width: unset;
                        width: calc(100vw - 32px);
                    }
                    .drp-presets {
                        flex-direction: row;
                        flex-wrap: wrap;
                        border-right: none;
                        border-bottom: 1px solid var(--border);
                        padding-right: 0;
                        padding-bottom: 12px;
                    }
                }
            `}</style>
        </div>
    );
}
