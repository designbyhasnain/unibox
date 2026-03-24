'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');
    const [isLoading, setIsLoading] = useState(false);

    const handleGoogleLogin = () => {
        setIsLoading(true);
        // Redirect to our CRM Google Auth entry point
        window.location.href = '/api/auth/crm/google';
    };

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
                    <h1 className="login-title">Unibox</h1>
                    <p className="login-subtitle">Premium CRM for Video Agencies</p>
                </div>

                <div className="login-body">
                    {error === 'unauthorized' && (
                        <div className="login-error-box">
                            <strong>Access Denied</strong>
                            <p>Your account has been deactivated. Contact your admin.</p>
                        </div>
                    )}
                    {error === 'auth_failed' && (
                        <div className="login-error-box">
                            <strong>Authentication Failed</strong>
                            <p>Could not verify your Google account. Please try again.</p>
                        </div>
                    )}
                    {error === 'no_invite' && (
                        <div className="login-error-box">
                            <strong>Invite Required</strong>
                            <p>You need an invitation to access this app. Contact your admin to get invited.</p>
                            <p style={{ fontSize: 10, color: '#999', marginTop: 4 }}>Debug: {searchParams.get('debug') || 'no debug info'}</p>
                        </div>
                    )}

                    <button 
                        className="google-login-btn" 
                        onClick={handleGoogleLogin}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <div className="login-spinner"></div>
                        ) : (
                            <>
                                <svg width="18" height="18" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                </svg>
                                <span>Sign in with Google</span>
                            </>
                        )}
                    </button>
                    
                    <p className="login-footer-text">
                        Protected by Unibox Guard
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="login-page"><div className="login-spinner"></div></div>}>
            <LoginContent />
        </Suspense>
    );
}
