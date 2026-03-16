'use client';
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    icon?: React.ReactNode;
}

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...props }: ButtonProps) {
    return (
        <button
            className={`btn btn--${variant} btn--${size} ${loading ? 'btn--loading' : ''} ${className || ''}`}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <span className="btn-spinner" />}
            {icon && <span className="btn-icon">{icon}</span>}
            {children}
        </button>
    );
}
