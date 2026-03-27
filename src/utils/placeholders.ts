export function replacePlaceholders(
    text: string,
    contact: { name?: string | null; email: string; company?: string | null; phone?: string | null },
    customVariables?: Record<string, string>
): string {
    const nameParts = contact.name?.trim().split(/\s+/) ?? [];

    const vars: Record<string, string> = {
        'first_name': nameParts[0] ?? '',
        'last_name': nameParts.slice(1).join(' ') ?? '',
        'full_name': contact.name ?? '',
        'company': contact.company ?? '',
        'email': contact.email,
        'phone': contact.phone ?? '',
    };

    // Custom variables (from CSV)
    if (customVariables) {
        Object.entries(customVariables).forEach(([k, v]) => { vars[k] = v; });
    }

    let result = text;
    Object.entries(vars).forEach(([k, v]) => {
        result = result.replaceAll(`{{${k}}}`, v);
    });

    // Default values: {{first_name|Friend}} → "Friend" if empty
    result = result.replace(/\{\{([^|}]+)\|([^}]*)\}\}/g, (_, _key, defaultVal) => defaultVal);

    // Unmapped variables → empty string
    result = result.replace(/\{\{[^}]+\}\}/g, '');

    return result;
}
