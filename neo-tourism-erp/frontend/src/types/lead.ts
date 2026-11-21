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

export const BUSINESS_LEAD_STATUSES: LeadStatus[] = [
  "NEW",
  "FOLLOW_UP",
  "GOING_TO_BOOK",
  "SALE_MADE",
  "NOT_INTERESTED",
  "BOOKED_ELSEWHERE",
  "TRAVEL_IN_FUTURE",
];

export const MANUAL_LEAD_STATUSES: LeadStatus[] = [
  "FOLLOW_UP",
  "GOING_TO_BOOK",
  "NOT_INTERESTED",
  "BOOKED_ELSEWHERE",
  "TRAVEL_IN_FUTURE",
];

export const LEGACY_LEAD_STATUSES: LeadStatus[] = [
  "HANDLING",
  "QUOTING",
  "CALLBACK",
  "NO_RESPONSE",
];

export interface LeadPerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface LeadCustomer extends LeadPerson {
  phone: string | null;
  secondaryPhone: string | null;
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
  receivedAt: string | null;
  travelDate: string | null;
  travelEndDate: string | null;
  summary: string | null;
  salesNotes: string | null;
  nextActionAt: string | null;
  lastMeaningfulActivityAt: string | null;
  isAttentionRequired: boolean;
  attentionReason:
    | "NO_ACTIVITY_3_DAYS"
    | "MISSED_CALLBACK"
    | "NO_FUTURE_ACTION"
    | null;
  attentionSince: string | null;
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
    | "LEAD_UPDATED"
    | "FOLLOW_UP_CREATED"
    | "FOLLOW_UP_UPDATED"
    | "FOLLOW_UP_COMPLETED"
    | "FOLLOW_UP_CANCELLED"
    | "FOLLOW_UP_MISSED"
    | "ATTENTION_FLAGGED"
    | "ATTENTION_CLEARED"
    | "LEAD_REASSIGNED"
    | "SALE_MADE_STARTED"
    | "SALE_SUBMISSION_UPDATED"
    | "SALE_SUBMITTED_TO_ADMIN"
    | "SALE_ACCEPTED_BY_ADMIN";
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: LeadPerson;
}

export type FollowUpType =
  | "CALLBACK"
  | "GENERAL_FOLLOW_UP"
  | "EMAIL_FOLLOW_UP"
  | "OTHER";

export type FollowUpStatus =
  | "SCHEDULED"
  | "COMPLETED"
  | "MISSED"
  | "CANCELLED";

export interface FollowUp {
  id: string;
  leadId: string;
  assignedUserId: string;
  type: FollowUpType;
  scheduledAt: string;
  note: string;
  status: FollowUpStatus;
  completedAt: string | null;
  createdAt: string;
  createdBy: LeadPerson;
  completedBy: LeadPerson | null;
  assignedUser: LeadPerson;
}

export interface FollowUpSummary {
  callbacksToday: number;
  missedCallbacks: number;
  attentionLeads: number;
  upcomingFollowUps: number;
}

export interface LeadDetail extends LeadSummary {
  createdBy: LeadPerson;
  activities: LeadActivity[];
  saleSubmission: {
    id: string;
    status: "DRAFT" | "SUBMITTED_TO_ADMIN" | "ADMIN_ACCEPTED" | "ADMIN_REJECTED" | "CANCELLED";
    submittedAt: string | null;
  } | null;
  booking: {
    id: string;
    _count: { passengers: number };
  } | null;
  callLogs: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    phoneNumber: string;
    startedAt: string;
    answeredAt: string | null;
    endedAt: string | null;
    status: string;
    user: LeadPerson;
  }>;
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
  const labels: Record<LeadStatus, string> = {
    NEW: "PENDING",
    FOLLOW_UP: "FOLLOWING UP",
    GOING_TO_BOOK: "GOING TO BOOK",
    SALE_MADE: "SALE DONE",
    NOT_INTERESTED: "NOT INTERESTED",
    BOOKED_ELSEWHERE: "BOOKED ELSEWHERE",
    TRAVEL_IN_FUTURE: "FUTURE BOOKINGS",
    HANDLING: "LEGACY — HANDLING",
    QUOTING: "LEGACY — QUOTING",
    CALLBACK: "LEGACY — CALLBACK",
    NO_RESPONSE: "LEGACY — NO RESPONSE",
  };
  return labels[status];
}
