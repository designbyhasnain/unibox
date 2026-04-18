'use client';
import { SkeletonEmailRow } from './components/LoadingStates';

export default function Loading() {
    return (
        <div style={{ width: '100%', flex: 1, overflow: 'hidden' }}>
            {Array.from({ length: 12 }).map((_, i) => (
                <SkeletonEmailRow key={i} index={i} />
            ))}
        </div>
    );
}
