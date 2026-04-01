import type { ProjectProgress, ProjectPriority, AMReview } from '@prisma/client';

export type { ProjectProgress, ProjectPriority, AMReview };

export type EditProjectType = {
  id: string;
  date: string | null;
  clientName: string | null;
  clientEmail: string | null;
  name: string;
  progress: ProjectProgress;
  isChecked: boolean;
  initialProjectValue: number | null;
  dueDate: string | null;
  startDate: string | null;
  approvedDate: string | null;
  completionDate: string | null;
  tags: string[];
  editor: string | null;
  accountManager: string | null;
  reviewedBy: string | null;
  team: string | null;
  sizeInGbs: string | null;
  hardDrive: string | null;
  rawDataUrl: string | null;
  fileNeeded: string | null;
  dataChecked: boolean;
  priority: ProjectPriority | null;
  briefDueDate: string | null;
  briefLength: string | null;
  songPreferences: string | null;
  software: string | null;
  notes: string | null;
  ratedByEditor: number | null;
  ratedByCH: number | null;
  reviewerValue: number | null;
  actualHours: number;
  workingHours: number;
  reviewerFeedback: string | null;
  totalProjectValue: number | null;
  formulaPercent: number;
  deductionOnDel: string | null;
  amReview: AMReview;
  totalAmount: number | null;
  paid: string | null;
  received1: number | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectCommentType = {
  id: string;
  content: string;
  authorName: string;
  authorId: string | null;
  imageUrl: string | null;
  projectId: string;
  createdAt: string;
};

export type ProjectWithCommentCount = EditProjectType & {
  _count: { comments: number };
};

export type CSVImportResult = {
  imported: number;
  failed: number;
  skipped: number;
  errors: string[];
};

export type ProjectFilters = {
  search?: string;
  progress?: ProjectProgress;
  editor?: string;
  accountManager?: string;
  priority?: ProjectPriority;
  tag?: string;
  sortBy?: ProjectSortField;
  sortOrder?: 'asc' | 'desc';
};

export type ProjectSortField =
  | 'name'
  | 'date'
  | 'clientName'
  | 'progress'
  | 'dueDate'
  | 'startDate'
  | 'priority'
  | 'editor'
  | 'accountManager'
  | 'initialProjectValue'
  | 'totalProjectValue'
  | 'createdAt'
  | 'actualHours'
  | 'team';

export type ColumnWidths = Record<string, number>;
