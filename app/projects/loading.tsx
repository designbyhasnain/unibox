'use client';
import { SkeletonCard, LoadingText } from '../components/LoadingStates';

export default function Loading() {
    return (
        <div style={{ padding: '2rem' }}>
            <LoadingText context="projects" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '1rem' }}>
                {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonCard key={i} index={i} />
                ))}
            </div>
        </div>
    );
}
