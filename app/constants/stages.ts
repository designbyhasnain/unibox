export const STAGE_COLORS: Record<string, string> = {
    COLD_LEAD: 'badge-blue',
    CONTACTED: 'badge-indigo',
    WARM_LEAD: 'badge-orange',
    LEAD: 'badge-yellow',
    OFFER_ACCEPTED: 'badge-green',
    CLOSED: 'badge-purple',
    NOT_INTERESTED: 'badge-red',
    REPLIED: 'badge-green',
    BOOKED: 'badge-purple',
};

export const STAGE_LABELS: Record<string, string> = {
    COLD_LEAD: 'Cold Prospect',
    CONTACTED: 'Contacted',
    WARM_LEAD: 'Warm Lead',
    LEAD: 'Lead',
    OFFER_ACCEPTED: 'Offer Accepted',
    CLOSED: 'Closed Won',
    NOT_INTERESTED: 'Closed Lost',
    REPLIED: 'Replied',
    BOOKED: 'Booked',
};

export const STAGE_OPTIONS = [
    { id: 'COLD_LEAD', label: 'Cold Prospect' },
    { id: 'CONTACTED', label: 'Contacted' },
    { id: 'WARM_LEAD', label: 'Warm Lead' },
    { id: 'LEAD', label: 'Lead' },
    { id: 'OFFER_ACCEPTED', label: 'Offer Accepted' },
    { id: 'CLOSED', label: 'Closed Won' },
    { id: 'NOT_INTERESTED', label: 'Closed Lost' },
];

/**
 * Universal helper to determine if a stage badge should be shown.
 */
export function shouldShowStageBadge(activeStage: string | undefined, emailStage: string | undefined, isSearchResults: boolean = false): boolean {
    if (!emailStage) return false;
    if (isSearchResults) return true;
    
    // Most reliable logic: Show it if we have a label for it
    return !!STAGE_LABELS[emailStage];
}

/**
 * Determines if an email matches the currently active tab/stage.
 */
export function doesEmailMatchTab(emailStage: string | undefined, activeTab: string): boolean {
    // If no stage is set, it belongs to the 'Cold' (COLD_LEAD) tab
    if (!emailStage) return activeTab === 'COLD_LEAD';
    return emailStage === activeTab;
}
