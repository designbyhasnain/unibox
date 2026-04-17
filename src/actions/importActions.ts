'use server';

import { supabase } from '../lib/supabase';
import { ensureAuthenticated } from '../lib/safe-action';
import { normalizeEmail } from '../utils/emailNormalizer';
import { blockEditorAccess } from '../utils/accessControl';

export type ImportRow = {
    email: string;
    name?: string;
    company?: string;
    website?: string;
    location?: string;
    phone?: string;
};

export type ImportPreview = {
    totalRows: number;
    newCount: number;
    duplicateCount: number;
    invalidCount: number;
    duplicates: { email: string; existingName: string; manager: string }[];
    validRows: ImportRow[];
};

export async function previewCSVImportAction(rows: ImportRow[]): Promise<ImportPreview> {
    const { role } = await ensureAuthenticated();
    blockEditorAccess(role);

    const validRows: ImportRow[] = [];
    const invalidCount = rows.filter(r => !r.email || !r.email.includes('@')).length;
    const emailRows = rows.filter(r => r.email && r.email.includes('@'));

    // Check which emails already exist
    const emails = emailRows.map(r => normalizeEmail(r.email));
    const { data: existing } = await supabase
        .from('contacts')
        .select('email, name, account_manager_id, users:account_manager_id(name)')
        .in('email', emails);

    const existingMap = new Map<string, any>();
    (existing || []).forEach((c: any) => {
        existingMap.set(c.email.toLowerCase(), c);
    });

    const duplicates: { email: string; existingName: string; manager: string }[] = [];

    for (const row of emailRows) {
        const clean = normalizeEmail(row.email);
        const ex = existingMap.get(clean);
        if (ex) {
            duplicates.push({
                email: clean,
                existingName: ex.name || clean,
                manager: ex.users?.name || 'Unassigned',
            });
        } else {
            validRows.push({ ...row, email: clean });
        }
    }

    return {
        totalRows: rows.length,
        newCount: validRows.length,
        duplicateCount: duplicates.length,
        invalidCount,
        duplicates: duplicates.slice(0, 20),
        validRows,
    };
}

export async function importCSVAction(rows: ImportRow[]): Promise<{
    imported: number;
    skipped: number;
    errors: number;
}> {
    const { userId, role } = await ensureAuthenticated();
    blockEditorAccess(role);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Batch insert with ON CONFLICT DO NOTHING
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const inserts = batch.map(r => ({
            email: normalizeEmail(r.email),
            name: r.name || r.email.split('@')[0],
            company: r.company || null,
            phone: r.phone || null,
            pipeline_stage: 'COLD_LEAD',
            is_lead: true,
            is_client: false,
            account_manager_id: userId,
            source: 'CSV Import',
            updated_at: new Date().toISOString(),
        }));

        const { data, error } = await supabase
            .from('contacts')
            .upsert(inserts, { onConflict: 'email', ignoreDuplicates: true })
            .select('id');

        if (error) {
            errors += batch.length;
        } else {
            imported += data?.length || 0;
            skipped += batch.length - (data?.length || 0);
        }
    }

    return { imported, skipped, errors };
}
