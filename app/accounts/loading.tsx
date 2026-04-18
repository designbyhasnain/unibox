'use client';
import { SkeletonCard } from '../components/LoadingStates';

export default function Loading() {
    return (
        <div style={{ padding: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} index={i} />
            ))}
        </div>
    );
}
