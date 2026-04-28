'use client';
import { useEffect, useState } from 'react';
import { listExistingTagsAction } from '../../../src/actions/projectMetadataActions';
import SmartSelect, { type SmartSelectOption } from './SmartSelect';

const TAG_COLORS = ['#1a73e8', '#e8711a', '#1ae871', '#e81a71', '#711ae8', '#e8d41a', '#1abce8'];
function hashColor(tag: string) {
    let h = 0;
    for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffffff;
    return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}

// Cache existing tags so opening 50 rows of TagsCells doesn't trigger 50 fetches.
let cached: string[] | null = null;
let inflight: Promise<string[]> | null = null;
function loadTags(): Promise<string[]> {
    if (cached) return Promise.resolve(cached);
    if (!inflight) {
        inflight = listExistingTagsAction().then(r => {
            inflight = null;
            if (r.success) { cached = r.tags; return r.tags; }
            return [];
        }).catch(() => { inflight = null; return []; });
    }
    return inflight;
}

// Push a freshly-created tag into the cache so it shows up on next open across the table.
function pushTag(tag: string) {
    if (!cached) cached = [];
    if (!cached.includes(tag)) cached = [tag, ...cached];
}

export default function TagsCell({ value, onChange }: {
    value: string[];
    onChange: (v: string[]) => void;
}) {
    const [tags, setTags] = useState<string[]>(cached ?? []);
    const [loading, setLoading] = useState(!cached);

    useEffect(() => {
        if (cached) return;
        loadTags().then(t => { setTags(t); setLoading(false); });
    }, []);

    const options: SmartSelectOption[] = tags.map(t => ({
        value: t,
        label: t,
        bg: hashColor(t),
        fg: '#fff',
    }));

    return (
        <SmartSelect
            mode="multi"
            value={value}
            onChange={onChange}
            options={options}
            loading={loading}
            creatable
            placeholder="Add tags…"
            minWidth={240}
            maxWidth={320}
            onCreate={(raw) => {
                const tag = raw.trim();
                pushTag(tag);
                setTags(prev => prev.includes(tag) ? prev : [tag, ...prev]);
                return tag;
            }}
        />
    );
}
