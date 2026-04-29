'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Popover from './Popover';

export type SmartSelectOption = {
    /** Unique value stored on the row (string id, enum key, or label). */
    value: string;
    /** What renders inside the dropdown row + (in single mode) the trigger pill. */
    label: string;
    /** Optional dim line under the label inside the dropdown only. */
    subtitle?: string;
    /** Optional pill colors. */
    bg?: string;
    fg?: string;
    /** Optional avatar string (initials computed if not given). When set, an avatar shows. */
    avatar?: string;
};

type CommonProps = {
    options: SmartSelectOption[];
    /** Show a "Loading…" placeholder until options arrive. */
    loading?: boolean;
    placeholder?: string;
    /** Pill className to keep visual parity with surrounding cells. */
    pillClass?: string;
    /** Min/max width on the popover. */
    minWidth?: number;
    maxWidth?: number;
    /** Hide the in-popover search input. */
    noSearch?: boolean;
};

type SingleProps = CommonProps & {
    mode?: 'single';
    value: string | null;
    onChange: (next: string | null) => void;
    /** Allow clearing back to null with an "Unassigned" / "None" row. */
    clearable?: boolean;
    clearLabel?: string;
    /** Allow typing a new option that isn't in the list yet. */
    creatable?: boolean;
    /** Called with the new label when the user picks the create row. Should
        return the canonical value to store (defaults to the typed label). */
    onCreate?: (raw: string) => string | Promise<string>;
};

type MultiProps = CommonProps & {
    mode: 'multi';
    value: string[];
    onChange: (next: string[]) => void;
    creatable?: boolean;
    onCreate?: (raw: string) => string | Promise<string>;
};

type Props = SingleProps | MultiProps;

function initials(s: string) { return (s || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(); }

function avatarColor(s: string) {
    const palette = ['#7c3aed', '#0891b2', '#d97706', '#dc2626', '#059669', '#db2777', '#0284c7'];
    let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return palette[Math.abs(h) % palette.length];
}

export default function SmartSelect(props: Props) {
    const { options, loading, placeholder, pillClass = 'ep-pill', minWidth = 220, maxWidth = 340, noSearch } = props;
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const triggerRef = useRef<HTMLSpanElement>(null);

    const isMulti = props.mode === 'multi';
    const selectedValues: string[] = isMulti ? props.value : (props.value ? [props.value] : []);

    const optionByValue = useMemo(() => {
        const m = new Map<string, SmartSelectOption>();
        for (const o of options) m.set(o.value, o);
        return m;
    }, [options]);

    const visible = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return options;
        return options.filter(o =>
            o.label.toLowerCase().includes(q) ||
            (o.subtitle ?? '').toLowerCase().includes(q),
        );
    }, [options, filter]);

    const exactMatch = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return false;
        return options.some(o => o.label.toLowerCase() === q || o.value.toLowerCase() === q);
    }, [options, filter]);

    function handleCreate() {
        const raw = filter.trim();
        if (!raw) return;
        Promise.resolve(props.onCreate ? props.onCreate(raw) : raw).then(canonical => {
            const v = canonical || raw;
            if (isMulti) {
                if (!props.value.includes(v)) props.onChange([...props.value, v]);
            } else {
                props.onChange(v);
                setOpen(false);
            }
            setFilter('');
        });
    }

    function pickValue(v: string) {
        if (isMulti) {
            if (props.value.includes(v)) {
                props.onChange(props.value.filter(x => x !== v));
            } else {
                props.onChange([...props.value, v]);
            }
            setFilter('');
        } else {
            props.onChange(v);
            setOpen(false);
            setFilter('');
        }
    }

    function clear() {
        if (isMulti) props.onChange([]);
        else props.onChange(null);
        setOpen(false);
        setFilter('');
    }

    function removeChip(v: string) {
        if (!isMulti) return;
        props.onChange(props.value.filter(x => x !== v));
    }

    // ─── Trigger ────────────────────────────────────────────────────────────
    let triggerContent: ReactNode;
    if (isMulti) {
        const first = selectedValues.slice(0, 2).map(v => optionByValue.get(v) ?? { value: v, label: v });
        const more = selectedValues.length - first.length;
        triggerContent = selectedValues.length === 0
            ? <span className="ep-cell-empty">{placeholder ?? '—'}</span>
            : (
                <span className="ep-ss-trigger-multi">
                    {first.map(o => (
                        <span key={o.value} className="ep-tag" style={{ borderColor: o.bg ?? 'var(--hairline)', color: o.bg ?? 'var(--ink-muted)' }}>{o.label}</span>
                    ))}
                    {more > 0 && <span className="ep-tag-more">+{more}</span>}
                </span>
            );
    } else {
        const sel = props.value ? optionByValue.get(props.value) : null;
        const label = sel?.label ?? props.value;
        if (!props.value) {
            triggerContent = <span className={pillClass} style={{ opacity: 0.4 }}>{placeholder ?? '—'}</span>;
        } else if (sel?.avatar !== undefined || (sel as any)?.bg === '__avatar__') {
            triggerContent = (
                <span className="ep-editor-pill">
                    <span className="ep-editor-avatar" style={{ background: avatarColor(label!) }}>
                        {sel?.avatar ?? initials(label!)}
                    </span>
                    <span className="ep-editor-name">{label}</span>
                </span>
            );
        } else {
            triggerContent = (
                <span className={pillClass} style={sel?.bg ? { background: sel.bg, color: sel.fg } : {}}>
                    {label}
                </span>
            );
        }
    }

    return (
        <>
            <span
                ref={triggerRef}
                className="ep-ss-trigger"
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
            >
                {triggerContent}
            </span>

            <Popover open={open} onClose={() => { setOpen(false); setFilter(''); }} triggerRef={triggerRef} minWidth={minWidth} maxWidth={maxWidth} className="ep-ss-pop">
                {isMulti && selectedValues.length > 0 && (
                    <div className="ep-ss-chips">
                        {selectedValues.map(v => {
                            const o = optionByValue.get(v) ?? { value: v, label: v };
                            return (
                                <span key={v} className="ep-tag ep-ss-chip" style={{ borderColor: o.bg ?? 'var(--hairline)', color: o.bg ?? 'var(--ink-muted)' }}>
                                    {o.label}
                                    <span className="ep-tag-x" onClick={(e) => { e.stopPropagation(); removeChip(v); }}>×</span>
                                </span>
                            );
                        })}
                    </div>
                )}

                {!noSearch && (
                    <input
                        autoFocus
                        className="ep-ss-search"
                        type="search"
                        placeholder={isMulti ? 'Search or add new…' : (placeholder ?? 'Search…')}
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && props.creatable && filter.trim() && !exactMatch) {
                                e.preventDefault();
                                handleCreate();
                            }
                        }}
                    />
                )}

                <div className="ep-ss-list">
                    {!isMulti && (props as SingleProps).clearable && (
                        <div className="ep-dropdown-item ep-ss-item" onClick={clear}>
                            <span className="ep-ss-empty-row">{(props as SingleProps).clearLabel ?? 'Unassigned'}</span>
                        </div>
                    )}

                    {loading && options.length === 0 && (
                        <div className="ep-ss-loading">Loading…</div>
                    )}

                    {visible.map(o => {
                        const selected = selectedValues.includes(o.value);
                        return (
                            <div
                                key={o.value}
                                className={`ep-dropdown-item ep-ss-item${selected ? ' ep-ss-item-selected' : ''}`}
                                onClick={() => pickValue(o.value)}
                            >
                                {isMulti && <span className={`ep-ss-check ${selected ? 'on' : ''}`}>{selected ? '✓' : ''}</span>}
                                {o.avatar !== undefined && (
                                    <span className="ep-editor-avatar" style={{ background: avatarColor(o.label) }}>
                                        {o.avatar || initials(o.label)}
                                    </span>
                                )}
                                <span className="ep-ss-row">
                                    {o.bg ? (
                                        <span className="ep-pill" style={{ background: o.bg, color: o.fg }}>{o.label}</span>
                                    ) : (
                                        <span className="ep-ss-label">{o.label}</span>
                                    )}
                                    {o.subtitle && <span className="ep-ss-sub">{o.subtitle}</span>}
                                </span>
                            </div>
                        );
                    })}

                    {visible.length === 0 && !loading && !props.creatable && (
                        <div className="ep-ss-loading">No matches.</div>
                    )}

                    {props.creatable && filter.trim() && !exactMatch && (
                        <div className="ep-dropdown-item ep-ss-item ep-ss-create" onClick={handleCreate}>
                            <span className="ep-ss-plus">＋</span>
                            <span>Add <b>{filter.trim()}</b></span>
                        </div>
                    )}
                </div>
            </Popover>
        </>
    );
}
