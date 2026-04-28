'use client';
import { useState, useRef, useEffect } from 'react';
import { listActiveEditorsAction, type ActiveEditor } from '../../../src/actions/editorAssignmentActions';
import Popover from './Popover';

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
    editorId: string | null;
    editorName: string | null;
    legacyName: string | null;
    /**
     * Emits the new editor id AND its display name. The parent's optimistic
     * update needs both so the cell re-renders instantly with the new label
     * — without the second arg the row would show "Unassigned" until the
     * next refetch picked up the joined editor name.
     */
    onChange: (newEditorId: string | null, newEditorName: string | null) => void;
};

export default function EditorAssignmentCell({ editorId, editorName, legacyName, onChange }: Props) {
    const [open, setOpen] = useState(false);
    const [editors, setEditors] = useState<ActiveEditor[] | null>(cachedEditors);
    const [filter, setFilter] = useState('');
    const triggerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (open && !editors) loadEditors().then(setEditors);
    }, [open, editors]);

    const visible = editors
        ? editors.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()) || e.email.toLowerCase().includes(filter.toLowerCase()))
        : [];

    const showAssigned = !!editorId && !!editorName;
    const showLegacy = !showAssigned && !!legacyName;

    return (
        <>
            <span
                ref={triggerRef}
                className="ep-editor-pill"
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
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

            <Popover open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} minWidth={280} maxWidth={360} className="ep-editor-dropdown">
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
                        onClick={() => { onChange(null, null); setOpen(false); }}
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
                            onClick={() => { onChange(ed.id, ed.name); setOpen(false); }}
                        >
                            <span className="ep-editor-avatar" style={{ background: avatarColor(ed.name) }}>
                                {initials(ed.name)}
                            </span>
                            <span className="ep-editor-name">{ed.name}</span>
                            <span className="ep-editor-email">{ed.email}</span>
                        </div>
                    ))}
                </div>
            </Popover>
        </>
    );
}
