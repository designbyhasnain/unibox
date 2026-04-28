'use client';
import { useEffect, useState } from 'react';
import { listAccountManagersAction, type AmCandidate } from '../../../src/actions/projectMetadataActions';
import SmartSelect, { type SmartSelectOption } from './SmartSelect';

// Module-level cache so opening 50 AM cells in a row triggers one fetch.
let cached: AmCandidate[] | null = null;
let inflight: Promise<AmCandidate[]> | null = null;
function loadAMs(): Promise<AmCandidate[]> {
    if (cached) return Promise.resolve(cached);
    if (!inflight) {
        inflight = listAccountManagersAction().then(r => {
            inflight = null;
            if (r.success) { cached = r.users; return r.users; }
            return [];
        }).catch(() => { inflight = null; return []; });
    }
    return inflight;
}

/**
 * Free-form `account_manager` string column on edit_projects. The dropdown
 * is a union of (1) every active SALES user — admins excluded since the AM
 * is an outward-facing role — and (2) every distinct legacy name already
 * present in the data. Picking either kind writes the display name to the
 * column, so no schema change required.
 */
export default function AccountManagerCell({ value, onChange }: {
    value: string | null;
    onChange: (v: string | null) => void;
}) {
    const [users, setUsers] = useState<AmCandidate[]>(cached ?? []);
    const [loading, setLoading] = useState(!cached);

    useEffect(() => {
        if (cached) return;
        loadAMs().then(u => { setUsers(u); setLoading(false); });
    }, []);

    const options: SmartSelectOption[] = users.map(u => ({
        value: u.value,
        label: u.name,
        subtitle: u.subtitle,
        // Real SALES users get an avatar; legacy strings render plain so the
        // distinction is obvious in the picker.
        avatar: u.legacy ? undefined : '',
    }));

    return (
        <SmartSelect
            mode="single"
            value={value}
            onChange={onChange}
            options={options}
            loading={loading}
            placeholder="Assign AM…"
            clearable
            clearLabel="Unassigned"
            minWidth={280}
            maxWidth={360}
        />
    );
}
