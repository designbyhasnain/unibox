export const STAGE_COLORS: Record<string, string> = {
    COLD_LEAD: 'badge-blue',
    LEAD: 'badge-yellow',
    OFFER_ACCEPTED: 'badge-green',
    CLOSED: 'badge-purple',
    NOT_INTERESTED: 'badge-red',
    REPLIED: 'badge-green',
    BOOKED: 'badge-purple',
};

export const STAGE_LABELS: Record<string, string> = {
    COLD_LEAD: 'Cold',
    LEAD: 'Lead',
    OFFER_ACCEPTED: 'Offer Accepted',
    CLOSED: 'Closed',
    NOT_INTERESTED: 'Not Interested',
    REPLIED: 'Replied',
    BOOKED: 'Booked',
};

export const STAGE_OPTIONS = [
    { id: 'COLD_LEAD', label: 'Cold' },
    { id: 'LEAD', label: 'Lead' },
    { id: 'OFFER_ACCEPTED', label: 'Offer Accepted' },
    { id: 'CLOSED', label: 'Closed' },
    { id: 'NOT_INTERESTED', label: 'Not Interested' },
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
