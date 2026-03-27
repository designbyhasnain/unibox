/**
 * Extract phone number from email body text.
 * Supports Pakistan (+92), US (+1), UK (+44), and international formats.
 */
export function extractPhoneFromText(text: string): string | null {
    if (!text) return null;

    // Strip HTML tags
    const plainText = text.replace(/<[^>]*>/g, ' ');

    const patterns = [
        /(?:\+92|0092|92)[\s\-]?(?:3\d{2})[\s\-]?\d{7}/g,   // Pakistan mobile
        /(?:\+92|0092|92)[\s\-]?\d{2,3}[\s\-]?\d{7}/g,       // Pakistan landline
        /0[0-9]{3}[\s\-]?[0-9]{7}/g,                           // Local Pakistan format
        /\+1[\s\-]?\(?\d{3}\)?[\s\-]?\d{3}[\s\-]?\d{4}/g,    // US format
        /\+44[\s\-]?\d{4}[\s\-]?\d{6}/g,                       // UK format
        /\+\d{1,3}[\s\-]?\d{6,14}/g,                           // International
        /\b\d{4}[\s\-]\d{7}\b/g,                               // XXXX-XXXXXXX
        /\b\d{11}\b/g,                                          // 11 digit number
    ];

    for (const pattern of patterns) {
        const matches = plainText.match(pattern);
        if (matches && matches.length > 0) {
            const phone = matches[0].replace(/[\s\-\(\)]/g, '').trim();
            if (phone.length >= 10) return phone;
        }
    }

    return null;
}
