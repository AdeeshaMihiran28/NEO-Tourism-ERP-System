export type SaleSubmissionStatus =
  | "DRAFT"
  | "SUBMITTED_TO_ADMIN"
  | "ADMIN_ACCEPTED"
  | "ADMIN_REJECTED"
  | "CANCELLED";

export type PaymentMethod =
  | "BANK_TRANSFER"
  | "CARD"
  | "CASH"
  | "WISE"
  | "OTHER";

export interface SalePerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface SaleSubmission {
  id: string;
  leadId: string;
  customerId: string;
  submittedByUserId: string;
  destination: string | null;
  travelStartDate: string | null;
  travelEndDate: string | null;
  sellingPrice: string | null;
  depositAmount: string | null;
  currency: string | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  salesNotes: string | null;
  status: SaleSubmissionStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: SalePerson & {
    phone: string | null;
    secondaryPhone: string | null;
  };
  submittedBy: SalePerson;
  lead: {
    id: string;
    status: string;
    destination: string | null;
    travelDate: string | null;
    summary: string | null;
    salesNotes: string | null;
    assignedUserId: string | null;
  };
}

export interface SaleSubmissionListResponse {
  data: SaleSubmission[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function saleStatusLabel(status: SaleSubmissionStatus) {
  const labels: Record<SaleSubmissionStatus, string> = {
    DRAFT: "Draft",
    SUBMITTED_TO_ADMIN: "Submitted",
    ADMIN_ACCEPTED: "Admin Accepted",
    ADMIN_REJECTED: "Admin Rejected",
    CANCELLED: "Cancelled",
  };
  return labels[status];
}
