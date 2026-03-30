import { NextResponse } from 'next/server';
import { migrateExistingData } from '../../../src/utils/migrationHelpers';
import { getSession } from '../../../src/lib/auth';

export async function POST() {
    const session = await getSession();
    if (!session || session.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const result = await migrateExistingData();
    return NextResponse.json(result);
}
