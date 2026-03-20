'use client';
import React from 'react';

interface ErrorAlertProps {
    message: string;
    onDismiss?: () => void;
}

export function ErrorAlert({ message, onDismiss }: ErrorAlertProps) {
    if (!message) return null;
    return (
        <div className="error-alert">
            <span>{message}</span>
            {onDismiss && <button className="error-alert-dismiss" onClick={onDismiss} aria-label="Dismiss">&times;</button>}
        </div>
    );
}
