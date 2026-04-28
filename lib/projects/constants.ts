export const PROGRESS_CONFIG = {
  ON_HOLD:     { label: "on Hold",     bg: "#f5c0c0", color: "#8b2020" },
  IN_PROGRESS: { label: "In Progress", bg: "#c0d8f5", color: "#1a4a8a" },
  DOWNLOADING: { label: "Downloading", bg: "#d4c0f5", color: "#4a1a8a" },
  DOWNLOADED:  { label: "Downloaded",  bg: "#f5e6c0", color: "#8a5a1a" },
  IN_REVISION: { label: "In Revision", bg: "#c0f5e6", color: "#1a6a4a" },
  APPROVED:    { label: "approved",    bg: "#c0f5c8", color: "#1a6a2a" },
  DONE:        { label: "done",        bg: "#a0d0a8", color: "#1a4a20" },
} as const;

export const PRIORITY_CONFIG = {
  HIGH:   { label: "High",   bg: "#f5c0c0", color: "#8b2020" },
  MEDIUM: { label: "Medium", bg: "#f5e6c0", color: "#8a5a1a" },
  LOW:    { label: "Low",    bg: "#c0f5c8", color: "#1a6a2a" },
} as const;

export const AM_REVIEW_CONFIG = {
  NO_ISSUE:  { label: "No Issue", bg: "#c0f5c8", color: "#1a6a2a" },
  HAS_ISSUE: { label: "Issue",    bg: "#f5c0c0", color: "#8b2020" },
} as const;

export const PAID_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  "paid":                  { label: "paid",                  bg: "#2d6a4f", color: "#ffffff" },
  "Unpaid":                { label: "Unpaid",                bg: "#6b2737", color: "#ffffff" },
  "Unpaid (paid $100)":    { label: "Unpaid (paid $100)",    bg: "#7d4e00", color: "#ffffff" },
  "NA":                    { label: "NA",                    bg: "#4a4a4a", color: "#ffffff" },
  "N/A":                   { label: "N/A",                   bg: "#4a4a4a", color: "#ffffff" },
  "Ghosted":               { label: "Ghosted",               bg: "#4a3a6b", color: "#ffffff" },
  "Invoiced":              { label: "Invoiced",              bg: "#1a4a6b", color: "#ffffff" },
  "Partially Paid":        { label: "Partially Paid",        bg: "#7d5a00", color: "#ffffff" },
  "Not paying":            { label: "Not paying",            bg: "#6b2020", color: "#ffffff" },
};

export const HARD_DRIVE_COLORS: Record<string, { bg: string; color: string }> = {
  "Virginia 2TB": { bg: "#3b5a8a", color: "#c8d8f0" },
  "New York 4TB": { bg: "#8a5a1a", color: "#f0d8a0" },
  "Florida 2TB":  { bg: "#3b5a8a", color: "#c8d8f0" },
  "Florida 2 2":  { bg: "#3b5a8a", color: "#c8d8f0" },
  "Arizona 4TB":  { bg: "#1a6a4a", color: "#a0f0d0" },
  "Texas 2TB":    { bg: "#8a5a1a", color: "#f0d8a0" },
};

export const HARD_DRIVE_OPTIONS = Object.keys(HARD_DRIVE_COLORS);

export const TABLE_COLUMNS = [
  { id: "select",              label: "",                   width: 32,  type: "checkbox" as const,  fixed: true },
  { id: "date",                label: "Date",               width: 130, type: "date" as const },
  { id: "clientName",          label: "Client name",        width: 160, type: "text" as const },
  { id: "clientEmail",         label: "Client email",       width: 200, type: "text" as const },
  { id: "name",                label: "Name",               width: 260, type: "text" as const,     primary: true },
  { id: "progress",            label: "progress",           width: 130, type: "progress" as const },
  { id: "isChecked",           label: "✓",                  width: 40,  type: "checkbox" as const },
  { id: "initialProjectValue", label: "Initial Project V.", width: 140, type: "number" as const },
  { id: "dueDate",             label: "Due",                width: 130, type: "datetime" as const },
  { id: "startDate",           label: "start date",         width: 130, type: "datetime" as const },
  { id: "approvedDate",        label: "approved date",      width: 130, type: "datetime" as const },
  { id: "tags",                label: "Tags",               width: 160, type: "tags" as const },
  { id: "editor",              label: "Editor",             width: 180, type: "editorAssignment" as const },
  { id: "team",                label: "TEAM",               width: 100, type: "text" as const },
  { id: "sizeInGbs",           label: "Size in Gbs",        width: 120, type: "text" as const },
  { id: "hardDrive",           label: "Hard Drive",         width: 130, type: "harddrive" as const },
  { id: "priority",            label: "Priority",           width: 100, type: "priority" as const },
  { id: "fileNeeded",          label: "File needed",        width: 120, type: "text" as const },
  { id: "reviewedBy",          label: "Reviewed By",        width: 130, type: "person" as const },
  { id: "ratedByEditor",       label: "Rated by Editor",    width: 120, type: "number" as const },
  { id: "ratedByCH",           label: "Rated by CH",        width: 110, type: "number" as const },
  { id: "reviewerValue",       label: "Reviewer Value",     width: 120, type: "number" as const },
  { id: "actualHours",         label: "Actual Hours",       width: 110, type: "number" as const },
  { id: "amReview",            label: "AM/Review",          width: 110, type: "amreview" as const },
  { id: "accountManager",      label: "Account Manager",    width: 180, type: "accountManager" as const },
  { id: "totalAmount",         label: "Total Amount",       width: 120, type: "number" as const },
  { id: "paid",                label: "Paid",               width: 140, type: "paid" as const },
  { id: "received1",           label: "Received 1",         width: 110, type: "number" as const },
] as const;

export type TableColumnDef = (typeof TABLE_COLUMNS)[number];

export const BOARD_COLUMN_ORDER = [
  'ON_HOLD',
  'DOWNLOADING',
  'DOWNLOADED',
  'IN_PROGRESS',
  'IN_REVISION',
  'APPROVED',
  'DONE',
] as const;

export const VIEW_TABS = [
  { id: 'all',            label: 'All tasks',        icon: '☰' },
  { id: 'board',          label: 'Board',            icon: '⊞' },
  { id: 'filters',        label: 'Filters Table',    icon: '⊞' },
  { id: 'due-am',         label: 'Due / Account managers', icon: '👤' },
  { id: 'due-weekly',     label: 'DUE/Weekly',       icon: '📅' },
  { id: 'downloaded',     label: 'Downloaded',       icon: '⬇' },
  { id: 'not-downloaded', label: 'Not Downloaded',   icon: '⬆' },
  { id: 'delivered',      label: 'Delivered/Success', icon: '✅' },
  { id: 'team-affan',     label: 'Team (AFFAN)',     icon: '👥' },
] as const;

export type ViewId = (typeof VIEW_TABS)[number]['id'];
