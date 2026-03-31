'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { validateInviteTokenAction } from '../../../src/actions/inviteActions';

function AcceptInviteContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const error = searchParams.get('error');
    const [invitation, setInvitation] = useState<any>(null);
    const [validationError, setValidationError] = useState<string | null>(error || null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAccepting, setIsAccepting] = useState(false);

    // Password setup state
    const [showPasswordSetup, setShowPasswordSetup] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isSavingPassword, setIsSavingPassword] = useState(false);

    useEffect(() => {
        if (!token) {
            setValidationError('No invitation token provided');
            setIsLoading(false);
            return;
        }
        validateInviteTokenAction(token).then(result => {
            if (result.valid) {
                setInvitation(result.invitation);
            } else {
                setValidationError(result.error || 'Invalid invitation');
            }
            setIsLoading(false);
        });
    }, [token]);

    const handleAccept = () => {
        setIsAccepting(true);
        window.location.href = `/api/auth/crm/google?invite_token=${token}`;
    };

    const handlePasswordSetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');

        if (password.length < 8) {
            setPasswordError('Password must be at least 8 characters');
            return;
        }
        if (password !== confirmPassword) {
            setPasswordError('Passwords do not match');
            return;
        }

        setIsSavingPassword(true);
        try {
            const res = await fetch('/api/auth/set-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: invitation.email,
                    password,
                    inviteToken: token,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setPasswordError(data.error || 'Failed to set password');
                setIsSavingPassword(false);
                return;
            }

            window.location.href = '/';
        } catch {
            setPasswordError('Something went wrong. Please try again.');
            setIsSavingPassword(false);
        }
    };

    if (isLoading) {
        return (
            <div className="login-page">
                <div className="login-card">
                    <div className="login-header">
                        <div className="login-spinner"></div>
                        <p style={{ color: '#5f6368', marginTop: 16 }}>Validating invitation...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (validationError) {
        return (
            <div className="login-page">
                <div className="login-card">
                    <div className="login-header">
                        <div className="login-logo">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                                <rect width="24" height="24" rx="6" fill="#d93025"/>
                                <path d="M12 8v4m0 4h.01" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <h1 className="login-title">Invalid Invitation</h1>
                        <p className="login-subtitle">{validationError}</p>
                    </div>
                    <div className="login-body">
                        <a href="/login" className="google-login-btn" style={{ textDecoration: 'none', justifyContent: 'center' }}>
                            Go to Login
                        </a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-logo">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                            <rect width="24" height="24" rx="6" fill="#1a73e8"/>
                            <path d="M7 9l5 3.5L17 9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <rect x="6" y="8" width="12" height="9" rx="1.5" stroke="#fff" strokeWidth="2"/>
                        </svg>
                    </div>
                    <h1 className="login-title">You&apos;re Invited!</h1>
                    <p className="login-subtitle">Join Unibox CRM</p>
                </div>

                <div className="login-body">
                    <div style={{
                        background: '#f1f3f4',
                        borderRadius: 12,
                        padding: '20px 24px',
                        marginBottom: 24,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ color: '#5f6368', fontSize: 13 }}>Invited by</span>
                            <span style={{ color: '#202124', fontSize: 13, fontWeight: 500 }}>{invitation.inviterName}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ color: '#5f6368', fontSize: 13 }}>Your name</span>
                            <span style={{ color: '#202124', fontSize: 13, fontWeight: 500 }}>{invitation.name}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ color: '#5f6368', fontSize: 13 }}>Email</span>
                            <span style={{ color: '#202124', fontSize: 13, fontWeight: 500 }}>{invitation.email}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#5f6368', fontSize: 13 }}>Role</span>
                            <span style={{
                                fontSize: 12,
                                fontWeight: 600,
                                padding: '2px 10px',
                                borderRadius: 20,
                                background: invitation.role === 'ADMIN' ? '#e8f0fe' : '#fef7e0',
                                color: invitation.role === 'ADMIN' ? '#1a73e8' : '#e37400',
                            }}>
                                {invitation.role}
                            </span>
                        </div>
                    </div>

                    {!showPasswordSetup ? (
                        <>
                            <button
                                className="google-login-btn"
                                onClick={handleAccept}
                                disabled={isAccepting}
                            >
                                {isAccepting ? (
                                    <div className="login-spinner"></div>
                                ) : (
                                    <>
                                        <svg width="18" height="18" viewBox="0 0 24 24">
                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                        </svg>
                                        <span>Accept & Sign in with Google</span>
                                    </>
                                )}
                            </button>

                            <div className="login-divider">
                                <span>or</span>
                            </div>

                            <button
                                className="login-email-btn"
                                onClick={() => setShowPasswordSetup(true)}
                            >
                                Set up Email & Password
                            </button>
                        </>
                    ) : (
                        <form onSubmit={handlePasswordSetup} className="login-email-form">
                            {passwordError && (
                                <div className="login-error-box">
                                    <p>{passwordError}</p>
                                </div>
                            )}
                            <input
                                type="email"
                                value={invitation.email}
                                disabled
                                className="login-input"
                                style={{ background: '#f1f3f4', color: '#5f6368' }}
                            />
                            <input
                                type="password"
                                placeholder="Create password (min 8 characters)"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="login-input"
                                autoComplete="new-password"
                                autoFocus
                            />
                            <input
                                type="password"
                                placeholder="Confirm password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                className="login-input"
                                autoComplete="new-password"
                            />
                            <button
                                type="submit"
                                className="login-email-btn"
                                disabled={isSavingPassword}
                            >
                                {isSavingPassword ? (
                                    <div className="login-spinner" style={{ borderTopColor: 'white' }}></div>
                                ) : (
                                    'Create Account & Sign In'
                                )}
                            </button>
                            <button
                                type="button"
                                className="google-login-btn"
                                onClick={() => setShowPasswordSetup(false)}
                                style={{ marginTop: 4 }}
                            >
                                Back
                            </button>
                        </form>
                    )}

                    <p className="login-footer-text">
                        By accepting, you&apos;ll join the Unibox workspace
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function AcceptInvitePage() {
    return (
        <Suspense fallback={<div className="login-page"><div className="login-spinner"></div></div>}>
            <AcceptInviteContent />
        </Suspense>
    );
}
