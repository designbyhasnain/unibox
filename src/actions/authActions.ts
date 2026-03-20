'use server';

import { getSession, clearSession } from '../lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function getCurrentUserAction() {
    return await getSession();
}

export async function logoutAction() {
    await clearSession();
    revalidatePath('/');
    redirect('/login');
}
