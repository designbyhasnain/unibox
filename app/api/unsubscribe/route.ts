import { NextResponse } from 'next/server';
import { supabase } from '../../../src/lib/supabase';
import { parseUnsubscribeToken } from '../../../src/utils/unsubscribe';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('t');
    const campaignId = searchParams.get('c');

    if (!token) {
        return new NextResponse('Invalid request', { status: 400 });
    }

    const parsed = parseUnsubscribeToken(token);
    if (!parsed) {
        return new NextResponse('Invalid token', { status: 400 });
    }
    const { email } = parsed;

    // Add to global unsubscribe list
    await supabase
        .from('unsubscribes')
        .upsert({ email, campaign_id: campaignId }, { onConflict: 'email' });

    // Update campaign contact status if campaign specified
    if (campaignId) {
        // Find contacts by email in this campaign
        const { data: contacts } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', email);

        if (contacts && contacts.length > 0) {
            const contactIds = contacts.map(c => c.id);
            await supabase
                .from('campaign_contacts')
                .update({
                    status: 'COMPLETED',
                    stopped_reason: 'UNSUBSCRIBED',
                    unsubscribed_at: new Date().toISOString(),
                })
                .eq('campaign_id', campaignId)
                .in('contact_id', contactIds);
        }
    }

    // Escape HTML entities to prevent XSS injection via crafted email addresses
    const safeEmail = email
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    return new NextResponse(
        `<!DOCTYPE html><html><head><title>Unsubscribed</title></head>
        <body style="font-family:system-ui;text-align:center;padding:80px;color:#333;background:#fafafa">
        <div style="max-width:400px;margin:0 auto;background:white;padding:40px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <h2 style="color:#e53e3e;margin-bottom:12px">Unsubscribed</h2>
        <p style="color:#666"><strong>${safeEmail}</strong> has been removed from future emails.</p>
        </div></body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
    );
}
