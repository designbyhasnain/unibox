'use client';
import { PAID_CONFIG } from '../../../lib/projects/constants';
import SmartSelect, { type SmartSelectOption } from './SmartSelect';

// Order: the three primary states first (the Prisma PaidStatus enum equivalents),
// then legacy / situational states already in the dataset.
const PRIMARY = ['paid', 'Partially Paid', 'Unpaid'];
const SECONDARY = ['Unpaid (paid $100)', 'Invoiced', 'Ghosted', 'Not paying', 'NA', 'N/A'];

export default function PaidCell({ value, onChange }: {
    value: string | null;
    onChange: (v: string | null) => void;
}) {
    const options: SmartSelectOption[] = [...PRIMARY, ...SECONDARY].map(k => {
        const c = PAID_CONFIG[k] ?? { label: k, bg: '#4a4a4a', color: '#fff' };
        return { value: k, label: c.label, bg: c.bg, fg: c.color };
    });

    return (
        <SmartSelect
            mode="single"
            value={value}
            onChange={onChange}
            options={options}
            clearable
            clearLabel="None"
            placeholder="Set status…"
            // Permit free-form for the rare label not in PAID_CONFIG so historical
            // imports keep working — e.g. someone typed a one-off note.
            creatable
            minWidth={200}
            maxWidth={280}
        />
    );
}
