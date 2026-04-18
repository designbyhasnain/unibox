'use client';
import { SkeletonEmailRow, LoadingText } from './components/LoadingStates';

export default function Loading() {
    return (
        <div style={{ width: '100%', flex: 1, overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem 0.5rem' }}>
                <LoadingText context="inbox" />
            </div>
            {Array.from({ length: 12 }).map((_, i) => (
                <SkeletonEmailRow key={i} index={i} />
            ))}
        </div>
    );
}
