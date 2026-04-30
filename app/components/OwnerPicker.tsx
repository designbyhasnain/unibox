'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { transferContactAction } from '../../src/actions/contactDetailActions';
import { getManagersAction } from '../../src/actions/projectActions';
import { firstName } from '../utils/nameDisplay';

export type OwnerPickerProps = {
    contactId: string;
    currentOwnerId: string | null;
    currentOwnerName: string | null;
    /** Where the picker is hosted — affects placeholder copy. */
    layout?: 'inline' | 'compact';
    /** Called after a successful transfer. Parents should refetch the contact / row, or use the supplied (id, name) to optimistically update. */
    onTransferred?: (newOwner: { id: string | null; name: string | null }) => void;
    /** Optional close callback when the picker is dismissed without transferring. */
    onCancel?: () => void;
    /** Whether the picker should auto-open. Use with `controlled` parent state. */
    open?: boolean;
};

/**
 * Inline picker for reassigning a contact's account_manager_id.
 * All transfers flow through transferContactAction → an OWNERSHIP_TRANSFER row
 * is written to activity_logs. See docs/AM-CREDIT-AND-OWNERSHIP-SCOPE.md.
 */
export default function OwnerPicker({
    contactId,
    currentOwnerId,
    currentOwnerName,
    layout = 'inline',
    onTransferred,
    onCancel,
    open: controlledOpen,
}: OwnerPickerProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen ?? internalOpen;

    const [managers, setManagers] = useState<Array<{ id: string; name: string }>>([]);
    const [managersLoading, setManagersLoading] = useState(false);
    const [managersError, setManagersError] = useState<string | null>(null);
    const [selection, setSelection] = useState<string>(currentOwnerId || '');
    const [reason, setReason] = useState<string>('');
    const [transferring, setTransferring] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Always refetch managers when the picker is opened — keeps the list current
    // and surfaces failures (auth, server error, empty result) loudly.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setManagersLoading(true);
        setManagersError(null);
        getManagersAction()
            .then(list => {
                if (cancelled) return;
                const cleaned = (list || []).filter((m: any) => m && m.id && m.name);
                setManagers(cleaned);
                if (cleaned.length === 0) {
                    setManagersError('No assignable managers found. Check the Team page or your role permissions.');
                }
            })
            .catch(err => {
                if (cancelled) return;
                setManagersError(err?.message || 'Failed to load managers');
                setManagers([]);
            })
            .finally(() => {
                if (!cancelled) setManagersLoading(false);
            });
        return () => { cancelled = true; };
    }, [open]);

    useEffect(() => {
        if (open) {
            setSelection(currentOwnerId || '');
            setReason('');
            setError(null);
        }
    }, [open, currentOwnerId]);

    // If we don't have an ID for the current owner but we have a name and the manager
    // list has loaded, try to preselect by name match (handles stale/incomplete row data).
    useEffect(() => {
        if (!open) return;
        if (selection) return;
        if (!currentOwnerName) return;
        if (managers.length === 0) return;
        const target = currentOwnerName.trim().toLowerCase();
        const firstWord = firstName(target).toLowerCase() || target;
        const match = managers.find(m => m.name.trim().toLowerCase() === target)
            || managers.find(m => m.name.trim().toLowerCase().startsWith(firstWord));
        if (match) setSelection(match.id);
    }, [open, selection, currentOwnerName, managers]);

    const handleOpen = useCallback(() => {
        if (controlledOpen === undefined) setInternalOpen(true);
    }, [controlledOpen]);

    const handleClose = useCallback(() => {
        if (controlledOpen === undefined) setInternalOpen(false);
        onCancel?.();
    }, [controlledOpen, onCancel]);

    const handleSubmit = useCallback(async () => {
        const target = selection || null;
        if (target === (currentOwnerId || null)) {
            handleClose();
            return;
        }
        setTransferring(true);
        setError(null);
        try {
            const result = await transferContactAction(contactId, target, {
                source: 'manual',
                reason: reason.trim() || undefined,
            });
            if (!result.success) {
                setError(result.error);
                setTransferring(false);
                return;
            }
            handleClose();
            const chosen = target ? managers.find(m => m.id === target) : null;
            onTransferred?.({ id: target, name: chosen?.name || null });
        } catch (e: any) {
            setError(e?.message || 'Transfer failed');
        }
        setTransferring(false);
    }, [contactId, selection, reason, currentOwnerId, handleClose, onTransferred]);

    const compact = layout === 'compact';

    if (!open) {
        return (
            <button
                onClick={handleOpen}
                title="Reassign this contact to a different account manager"
                className="owner-picker__trigger"
                data-compact={compact ? '' : undefined}
            >
                Change
            </button>
        );
    }

    // Compact mode = labels stack on top of inputs (narrow column),
    // default = labels inline (wider modal-style row).
    const stackInputs = compact;

    return (
        <div className={`owner-picker ${compact ? 'owner-picker--compact' : ''}`}>
            <div className="owner-picker__row" data-stack={stackInputs ? '' : undefined}>
                <label className="owner-picker__label" data-stack={stackInputs ? '' : undefined}>New owner</label>
                <select
                    value={selection}
                    onChange={e => setSelection(e.target.value)}
                    disabled={managersLoading}
                    className="owner-picker__control"
                    data-stack={stackInputs ? '' : undefined}
                >
                    <option value="">— Unassigned —</option>
                    {managers.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                </select>
                <div className={`owner-picker__hint ${managersError ? 'is-error' : ''}`}>
                    {managersLoading
                        ? 'Loading managers…'
                        : managersError
                            ? managersError
                            : `${managers.length} manager${managers.length === 1 ? '' : 's'} available`}
                </div>
            </div>
            <div className="owner-picker__row" data-stack={stackInputs ? '' : undefined}>
                <label className="owner-picker__label" data-stack={stackInputs ? '' : undefined}>
                    Reason <span style={{ opacity: 0.6, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder={currentOwnerName ? `e.g. "${firstName(currentOwnerName)} left, handing over"` : 'e.g. "Initial assignment"'}
                    className="owner-picker__control"
                    data-stack={stackInputs ? '' : undefined}
                />
            </div>
            {error && <div className="owner-picker__hint is-error">{error}</div>}
            <div className="owner-picker__actions">
                <button onClick={handleClose} disabled={transferring} className="btn btn-secondary sm">Cancel</button>
                <button onClick={handleSubmit} disabled={transferring} className="btn btn-primary sm">
                    {transferring ? 'Transferring…' : 'Transfer'}
                </button>
            </div>
            <div className="owner-picker__footnote">
                Logged as <strong>OWNERSHIP_TRANSFER</strong> in activity log · actor / from / to / source=&quot;manual&quot; / reason.
            </div>
        </div>
    );
}
