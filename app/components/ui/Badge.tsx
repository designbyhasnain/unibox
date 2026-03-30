'use client';
import React from 'react';

interface BadgeProps {
    variant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
    size?: 'sm' | 'md';
    children: React.ReactNode;
    className?: string;
}

export function Badge({ variant = 'neutral', size = 'sm', children, className }: BadgeProps) {
    return (
        <span className={`badge badge--${variant} badge--${size} ${className || ''}`}>
            {children}
        </span>
    );
}
