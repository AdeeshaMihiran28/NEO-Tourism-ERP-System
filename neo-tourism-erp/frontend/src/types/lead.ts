export const LEAD_STATUSES = [
  "NEW",
  "HANDLING",
  "QUOTING",
  "FOLLOW_UP",
  "CALLBACK",
  "GOING_TO_BOOK",
  "SALE_MADE",
  "BOOKED_ELSEWHERE",
  "NOT_INTERESTED",
  "NO_RESPONSE",
  "TRAVEL_IN_FUTURE",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadPerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface LeadCustomer extends LeadPerson {
  phone: string | null;
  customerType: "NEW" | "REPEAT" | "REFERRAL";
}

export interface LeadSummary {
  id: string;
  customerId: string;
  assignedUserId: string | null;
  assignedAt: string | null;
  status: LeadStatus;
  source: string | null;
  destination: string | null;
  travelDate: string | null;
  summary: string | null;
  salesNotes: string | null;
  nextActionAt: string | null;
  lastMeaningfulActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: LeadCustomer;
  assignedUser: LeadPerson | null;
}

export interface LeadActivity {
  id: string;
  type:
    | "LEAD_CREATED"
    | "LEAD_ASSIGNED"
    | "STATUS_CHANGED"
    | "NOTE_ADDED"
    | "LEAD_UPDATED";
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: LeadPerson;
}

export interface LeadDetail extends LeadSummary {
  createdBy: LeadPerson;
  activities: LeadActivity[];
}

export interface LeadListResponse {
  data: LeadSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function leadStatusLabel(status: LeadStatus): string {
  return status.replaceAll("_", " ");
}
