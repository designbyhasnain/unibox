'use client';
import { useEffect, useState } from 'react';
import { listAccountManagersAction, type AmCandidate } from '../../../src/actions/projectMetadataActions';
import SmartSelect, { type SmartSelectOption } from './SmartSelect';

// Module-level cache so opening a 2nd cell doesn't refetch.
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
 * Free-form `accountManager` string column on edit_projects. The dropdown
 * matches by name (case-insensitive) so picking John Doe from the list
 * sets `accountManager: 'John Doe'` — keeping the legacy schema intact
 * while bringing the data under a real list.
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
        value: u.name,
        label: u.name,
        subtitle: u.email,
        avatar: '', // tells SmartSelect to render an avatar
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
            minWidth={260}
            maxWidth={340}
        />
    );
}
