export interface ParsedLead {
    email: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    phone?: string;
    website?: string;
    linkedIn?: string;
    customVariables: Record<string, string>;
}

const FIELD_MAP: Record<string, string> = {
    'email': 'email', 'email address': 'email',
    'first name': 'firstName', 'firstname': 'firstName', 'first_name': 'firstName',
    'last name': 'lastName', 'lastname': 'lastName', 'last_name': 'lastName',
    'company': 'company', 'company name': 'company', 'organization': 'company',
    'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone',
    'website': 'website', 'url': 'website',
    'linkedin': 'linkedIn', 'linkedin url': 'linkedIn',
};

export function parseLeadsCSV(csvText: string): {
    leads: ParsedLead[];
    headers: string[];
    customColumns: string[];
    errors: string[];
} {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return { leads: [], headers: [], customColumns: [], errors: ['CSV is empty or has no data rows'] };

    const headers = lines[0]!.split(',').map(h => h.trim().replace(/"/g, ''));
    const customColumns: string[] = [];
    const errors: string[] = [];
    const leads: ParsedLead[] = [];

    headers.forEach(h => {
        if (!FIELD_MAP[h.toLowerCase()]) customColumns.push(h);
    });

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line?.trim()) continue;
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        const lead: ParsedLead = { email: '', customVariables: {} };

        headers.forEach((header, idx) => {
            const mappedField = FIELD_MAP[header.toLowerCase()];
            const value = values[idx] ?? '';
            if (mappedField) (lead as any)[mappedField] = value;
            else lead.customVariables[header] = value;
        });

        if (!lead.email?.includes('@')) {
            errors.push(`Row ${i + 1}: Invalid email — "${lead.email}"`);
            continue;
        }
        leads.push(lead);
    }

    return { leads, headers, customColumns, errors };
}
