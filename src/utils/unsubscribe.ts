export function generateUnsubscribeLink(email: string, campaignId: string): string {
    const token = Buffer.from(email).toString('base64url');
    return `${process.env.NEXT_PUBLIC_APP_URL}/api/unsubscribe?t=${token}&c=${campaignId}`;
}

export function injectUnsubscribeLink(body: string, email: string, campaignId: string): string {
    const link = generateUnsubscribeLink(email, campaignId);
    return body + `<p style="font-size:11px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
    If you no longer wish to receive these emails, <a href="${link}" style="color:#999">unsubscribe here</a>.
  </p>`;
}
