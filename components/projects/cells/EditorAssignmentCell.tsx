'use client';
import { useState, useRef, useEffect } from 'react';
import { listActiveEditorsAction, type ActiveEditor } from '../../../src/actions/editorAssignmentActions';

// Module-level cache so opening the dropdown a second time doesn't refetch.
let cachedEditors: ActiveEditor[] | null = null;
let inflight: Promise<ActiveEditor[]> | null = null;

async function loadEditors(): Promise<ActiveEditor[]> {
    if (cachedEditors) return cachedEditors;
    if (!inflight) {
        inflight = listActiveEditorsAction().then(r => {
            inflight = null;
            if (r.success) { cachedEditors = r.editors; return r.editors; }
            return [];
        }).catch(() => { inflight = null; return []; });
    }
    return inflight;
}

function avatarColor(s: string) {
    const p = ['#7c3aed', '#0891b2', '#d97706', '#dc2626', '#059669', '#db2777', '#0284c7'];
    let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return p[Math.abs(h) % p.length];
}
function initials(s: string) { return (s || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

type Props = {
    /** Currently-assigned editor user id (null = unassigned). */
    editorId: string | null;
    /** Cached display name from the parent's joined query — avoids a per-row fetch. */
    editorName: string | null;
    /** Legacy free-form `editor` string from the row, shown in italic when there's no FK assignment. */
    legacyName: string | null;
    onChange: (newEditorId: string | null) => void;
};

export default function EditorAssignmentCell({ editorId, editorName, legacyName, onChange }: Props) {
    const [open, setOpen] = useState(false);
    const [editors, setEditors] = useState<ActiveEditor[] | null>(cachedEditors);
    const [filter, setFilter] = useState('');
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        if (!editors) loadEditors().then(setEditors);
        const onClick = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open, editors]);

    const visible = editors
        ? editors.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()) || e.email.toLowerCase().includes(filter.toLowerCase()))
        : [];

    // Header label: assigned editor name → legacy string (italic) → "Unassigned" placeholder.
    const showAssigned = !!editorId && !!editorName;
    const showLegacy = !showAssigned && !!legacyName;

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            <span
                className="ep-editor-pill"
                onClick={e => { e.stopPropagation(); setOpen(!open); }}
                style={showAssigned ? {} : { opacity: showLegacy ? 0.7 : 0.4, fontStyle: showLegacy ? 'italic' : 'normal' }}
                title={showLegacy ? `Legacy: ${legacyName} — click to assign a real editor` : undefined}
            >
                {showAssigned && (
                    <span className="ep-editor-avatar" style={{ background: avatarColor(editorName!) }}>
                        {initials(editorName!)}
                    </span>
                )}
                <span className="ep-editor-name">
                    {showAssigned ? editorName : (showLegacy ? legacyName : 'Unassigned')}
                </span>
            </span>

            {open && (
                <div className="ep-dropdown ep-editor-dropdown" onClick={e => e.stopPropagation()}>
                    <input
                        autoFocus
                        className="ep-editor-search"
                        type="search"
                        placeholder="Search editor…"
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                    <div className="ep-editor-list">
                        <div
                            className={`ep-dropdown-item ep-editor-item${editorId === null ? ' ep-editor-active' : ''}`}
                            onClick={() => { onChange(null); setOpen(false); }}
                        >
                            <span className="ep-editor-avatar" style={{ background: '#3a3a40' }}>?</span>
                            <span className="ep-editor-name" style={{ opacity: 0.7, fontStyle: 'italic' }}>Unassigned</span>
                        </div>
                        {!editors && <div className="ep-editor-loading">Loading editors…</div>}
                        {editors && visible.length === 0 && (
                            <div className="ep-editor-loading">No editors match.</div>
                        )}
                        {visible.map(ed => (
                            <div
                                key={ed.id}
                                className={`ep-dropdown-item ep-editor-item${editorId === ed.id ? ' ep-editor-active' : ''}`}
                                onClick={() => { onChange(ed.id); setOpen(false); }}
                            >
                                <span className="ep-editor-avatar" style={{ background: avatarColor(ed.name) }}>
                                    {initials(ed.name)}
                                </span>
                                <span className="ep-editor-name">{ed.name}</span>
                                <span className="ep-editor-email">{ed.email}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
