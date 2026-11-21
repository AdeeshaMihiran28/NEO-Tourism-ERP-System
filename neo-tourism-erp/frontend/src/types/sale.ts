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

export type BookingPaymentType =
  | "FULL_PAYMENT"
  | "DEPOSIT"
  | "INTERNAL_DEPOSIT";

export type SalePaymentMethod =
  | "BANK_TRANSFER"
  | "STRIPE_PAYMENT"
  | "WISE_CARD_PAYMENT"
  | "CASH";

export type SalePaymentEntryStatus = "RECORDED" | "VERIFIED";

export interface SalePerson {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department?: { id: string; name: string } | null;
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
  estimatedCostOfSale: string | null;
  depositAmount: string | null;
  paymentType: BookingPaymentType | null;
  initialPaymentAmount: string | null;
  finalBalancePaymentDate: string | null;
  paymentArrangementNotes: string | null;
  currency: string | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  salesNotes: string | null;
  passengerInformation: string | null;
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
  booking: { id: string; folderNumber: string } | null;
  products: SaleSubmissionProduct[];
  paymentEntries: SalePaymentEntry[];
  installments: SaleInstallment[];
}

export interface SalePaymentEvidence {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  uploadedBy: SalePerson;
}

export interface SalePaymentEntry {
  id: string;
  method: SalePaymentMethod;
  amount: string;
  paymentDate: string;
  transactionReference: string | null;
  notes: string | null;
  status: SalePaymentEntryStatus;
  evidence: SalePaymentEvidence[];
  createdAt: string;
  updatedAt: string;
}

export interface SaleInstallment {
  id: string;
  amount: string;
  dueDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SaleProductCategory =
  | "INTERNATIONAL_FLIGHT"
  | "BUDGET_CARRIER"
  | "HOTEL"
  | "TRANSFER"
  | "TOUR";

export type SaleProductReferenceType =
  | "PNR"
  | "SUPPLIER_BOOKING_REFERENCE"
  | "AIRLINE_REFERENCE"
  | "HOTEL_REFERENCE"
  | "IV_REFERENCE"
  | "AMADEUS_REFERENCE"
  | "OTHER";

export interface SaleProductReference {
  id: string;
  type: SaleProductReferenceType;
  value: string;
}

export interface SaleProductAttachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  uploadedBy: SalePerson;
}

export interface SaleSubmissionProduct {
  id: string;
  category: SaleProductCategory;
  description: string;
  supplierId: string | null;
  estimatedSupplierCost: string | null;
  pnrText: string | null;
  notes: string | null;
  supplier: { id: string; name: string; supplierType: string } | null;
  references: SaleProductReference[];
  attachments: SaleProductAttachment[];
  createdAt: string;
  updatedAt: string;
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
