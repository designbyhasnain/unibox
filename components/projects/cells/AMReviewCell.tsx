'use client';
import { AM_REVIEW_CONFIG } from '../../../lib/projects/constants';
import type { AMReview } from '../../../lib/projects/types';
import SmartSelect, { type SmartSelectOption } from './SmartSelect';

const ORDER: AMReview[] = ['NO_ISSUE', 'HAS_ISSUE'] as AMReview[];

export default function AMReviewCell({ value, onChange }: {
    value: AMReview;
    onChange: (v: AMReview) => void;
}) {
    const options: SmartSelectOption[] = ORDER.map(v => {
        const c = (AM_REVIEW_CONFIG as Record<string, { label: string; bg: string; color: string }>)[v]
            ?? { label: v, bg: '#4a4a4a', color: '#fff' };
        return { value: v, label: c.label, bg: c.bg, fg: c.color };
    });

    // The DB column is non-null (defaults to NO_ISSUE) so we don't allow clearing.
    return (
        <SmartSelect
            mode="single"
            value={value || 'NO_ISSUE'}
            onChange={(v) => v && onChange(v as AMReview)}
            options={options}
            noSearch
            minWidth={140}
            maxWidth={200}
        />
    );
}
