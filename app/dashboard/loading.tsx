'use client';
import { SkeletonStatCard, SkeletonChartCard, LoadingText } from '../components/LoadingStates';

export default function Loading() {
    return (
        <div style={{ padding: '2rem' }}>
            <LoadingText context="dashboard" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginTop: '1rem', marginBottom: '2rem' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonStatCard key={i} index={i} />
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
                {Array.from({ length: 2 }).map((_, i) => (
                    <SkeletonChartCard key={i} index={i} />
                ))}
            </div>
        </div>
    );
}
