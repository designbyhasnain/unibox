'use client';
import React from 'react';

interface FormFieldProps {
    label: string;
    htmlFor?: string;
    error?: string;
    required?: boolean;
    children: React.ReactNode;
}

export function FormField({ label, htmlFor, error, required, children }: FormFieldProps) {
    return (
        <div className="form-field">
            <label className="form-label" htmlFor={htmlFor}>
                {label}
                {required && <span className="form-required">*</span>}
            </label>
            {children}
            {error && <p className="form-error">{error}</p>}
        </div>
    );
}

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function FormInput({ className, ...props }: FormInputProps) {
    return <input className={`form-input ${className || ''}`} {...props} />;
}

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    children: React.ReactNode;
}

export function FormSelect({ className, children, ...props }: FormSelectProps) {
    return <select className={`form-select ${className || ''}`} {...props}>{children}</select>;
}

interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function FormTextarea({ className, ...props }: FormTextareaProps) {
    return <textarea className={`form-textarea ${className || ''}`} {...props} />;
}
