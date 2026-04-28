'use client';
import { useEffect, useState } from 'react';
import { HARD_DRIVE_COLORS } from '../../../lib/projects/constants';
import { listExistingHardDrivesAction } from '../../../src/actions/projectMetadataActions';
import SmartSelect, { type SmartSelectOption } from './SmartSelect';

let cached: string[] | null = null;
let inflight: Promise<string[]> | null = null;
function loadDrives(): Promise<string[]> {
    if (cached) return Promise.resolve(cached);
    if (!inflight) {
        inflight = listExistingHardDrivesAction().then(r => {
            inflight = null;
            if (r.success) { cached = r.drives; return r.drives; }
            return [];
        }).catch(() => { inflight = null; return []; });
    }
    return inflight;
}

function pushDrive(label: string) {
    if (!cached) cached = [];
    if (!cached.includes(label)) cached = [label, ...cached];
}

// Generate a stable color for unknown labels so new drives still look like pills.
const HD_PALETTE: ReadonlyArray<{ bg: string; color: string }> = [
    { bg: '#3b5a8a', color: '#c8d8f0' },
    { bg: '#1a6a4a', color: '#a0f0d0' },
    { bg: '#8a5a1a', color: '#f0d8a0' },
    { bg: '#6b2737', color: '#f0c8d0' },
    { bg: '#4a3a6b', color: '#d8c8f0' },
];
function colorFor(label: string): { bg: string; color: string } {
    const known = HARD_DRIVE_COLORS[label];
    if (known) return known;
    let h = 0; for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) & 0xffffff;
    return HD_PALETTE[Math.abs(h) % HD_PALETTE.length] ?? HD_PALETTE[0]!;
}

export default function HardDriveCell({ value, onChange }: {
    value: string | null;
    onChange: (v: string | null) => void;
}) {
    const [drives, setDrives] = useState<string[]>(cached ?? []);
    const [loading, setLoading] = useState(!cached);

    useEffect(() => {
        if (cached) return;
        loadDrives().then(d => { setDrives(d); setLoading(false); });
    }, []);

    const options: SmartSelectOption[] = drives.map(d => {
        const c = colorFor(d);
        return { value: d, label: d, bg: c.bg, fg: c.color };
    });

    return (
        <SmartSelect
            mode="single"
            value={value}
            onChange={onChange}
            options={options}
            loading={loading}
            creatable
            clearable
            clearLabel="None"
            placeholder="Pick a drive…"
            minWidth={220}
            maxWidth={300}
            onCreate={(raw) => {
                const label = raw.trim();
                pushDrive(label);
                setDrives(prev => prev.includes(label) ? prev : [label, ...prev]);
                return label;
            }}
        />
    );
}
