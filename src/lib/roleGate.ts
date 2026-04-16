import { redirect } from 'next/navigation';
import { getSession } from './auth';
import { supabase } from './supabase';

export type FreshSession = {
    userId: string;
    email: string;
    name: string;
    role: string;
};

export async function getFreshSession(): Promise<FreshSession | null> {
    const session = await getSession();
    if (!session) return null;

    const { data: user } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.userId)
        .maybeSingle();

    if (!user) return null;
    return { ...session, role: user.role };
}

const EDITOR_ALLOWED_PATHS = ['/dashboard', '/projects', '/settings'];

export async function blockEditorAccess(redirectTo = '/dashboard'): Promise<FreshSession> {
    const session = await getFreshSession();
    if (!session) redirect('/login');
    if (session.role === 'VIDEO_EDITOR') redirect(redirectTo);
    return session;
}

export async function requireAdminAccess(redirectTo = '/'): Promise<FreshSession> {
    const session = await getFreshSession();
    if (!session) redirect('/login');
    if (session.role !== 'ADMIN' && session.role !== 'ACCOUNT_MANAGER') redirect(redirectTo);
    return session;
}

export function isEditorAllowedPath(pathname: string): boolean {
    return EDITOR_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
