'use client';

import React from 'react';

interface ErrorBoundaryProps {
    children: React.ReactNode;
    /** Label shown in the error UI so users know which section crashed */
    section?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[ErrorBoundary${this.props.section ? ` — ${this.props.section}` : ''}]`, error, info.componentStack);
    }

    private handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '3rem 1.5rem',
                    gap: '0.75rem',
                    color: 'var(--text-secondary, #666)',
                    minHeight: 200,
                }}>
                    <div style={{
                        width: 48, height: 48,
                        borderRadius: '50%',
                        background: 'var(--danger-bg, #fef2f2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 22,
                    }}>
                        !
                    </div>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary, #333)' }}>
                        {this.props.section
                            ? `Something went wrong in ${this.props.section}`
                            : 'Something went wrong'}
                    </p>
                    <p style={{ margin: 0, fontSize: 13, maxWidth: 400, textAlign: 'center' }}>
                        {this.state.error?.message || 'An unexpected error occurred.'}
                    </p>
                    <button
                        onClick={this.handleRetry}
                        style={{
                            marginTop: 8,
                            padding: '8px 20px',
                            border: '1px solid var(--border, #e0e0e0)',
                            borderRadius: 8,
                            background: 'var(--bg-surface, #fff)',
                            cursor: 'pointer',
                            fontWeight: 500,
                            fontSize: 13,
                            color: 'var(--text-primary, #333)',
                        }}
                    >
                        Try again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
