'use client';
import { SkeletonCard, LoadingText } from '../components/LoadingStates';

export default function TemplatesLoading() {
    return (
        <div style={{ padding: '1.5rem', width: '100%', flex: 1 }}>
            <LoadingText context="templates" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonCard key={i} index={i} />
                ))}
            </div>
        </div>
    );
}
