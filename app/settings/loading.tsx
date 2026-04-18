'use client';
import { LoadingText } from '../components/LoadingStates';

export default function Loading() {
    return (
        <div style={{ padding: '2rem', maxWidth: 700, margin: '0 auto' }}>
            <LoadingText context="settings" />
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton-row-stagger" style={{ marginTop: i === 0 ? 16 : 0, marginBottom: 24, animationDelay: `${i * 50}ms` }}>
                    <div className="skeleton-box shimmer" style={{ width: 120, height: 14, borderRadius: 4, marginBottom: 8 }} />
                    <div className="skeleton-box shimmer" style={{ width: '100%', height: 40, borderRadius: 8 }} />
                </div>
            ))}
        </div>
    );
}
