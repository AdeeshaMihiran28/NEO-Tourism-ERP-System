import type {
  BookingPaymentType,
  SaleInstallment,
  SalePaymentEntry,
  SalePerson,
  SaleProductCategory,
  SaleSubmissionProduct,
  SaleSubmissionStatus,
} from "./sale";

export type BookingStatus = "NEW" | "IN_PROGRESS" | "READY" | "COMPLETED" | "CANCELLED";
export type TravelStatus = "PENDING" | "UPCOMING" | "IN_TRAVEL" | "TRAVEL_COMPLETE" | "CANCELLED";
export type OperationsStatus = "PENDING" | "IN_PROGRESS" | "SUPPLIER_PENDING" | "TICKETING_PENDING" | "READY" | "COMPLETE" | "ACTION_REQUIRED";
export type BookingProductStatus = "PENDING" | "CONFIRMED" | "BOOKED_PAYMENT_PENDING" | "BOOKED_PAID" | "SCHEDULE_CHANGE" | "SCHEDULE_CHANGE_COMPLETE" | "TRAVEL_COMPLETE" | "CANCELLED";
export type BookingProductIssueType = "SCHEDULE_CHANGE" | "MISSING_PASSENGER_DOCUMENTS" | "SUPPLIER_PAYMENT_PENDING" | "BOOKING_CONFIRMATION_PENDING" | "TICKET_ISSUANCE_PENDING" | "OTHER";
export interface BookingProductIssue { id: string; type: BookingProductIssueType; originalDetails: string | null; revisedDetails: string | null; reason: string; notes: string | null; status: "OPEN" | "RESOLVED"; resolutionNotes: string | null; createdAt: string; resolvedAt: string | null; createdBy: SalePerson; resolvedBy: SalePerson | null; followUps: Array<{ id: string; content: string; createdAt: string; createdBy: SalePerson }> }

export interface BookingSummary {
  id: string;
  folderNumber: string;
  destination: string;
  travelStartDate: string;
  travelEndDate: string | null;
  status: BookingStatus;
  travelStatus: TravelStatus;
  operationsStatus: OperationsStatus;
  customer: { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null };
  salesAdvisor: SalePerson;
  operationsOwner: SalePerson | null;
  createdAt: string;
  saleSubmission: {
    paymentType: BookingPaymentType | null;
    products: Array<{ category: SaleProductCategory }>;
  };
  _count?: { productIssues: number; specialRequests: number };
}

export type BookingSpecialRequestType = "FLIGHT" | "HOTEL" | "SPECIAL_ASSISTANCE" | "DIETARY" | "BAGGAGE" | "TRANSFER" | "OTHER";
export type BookingSpecialRequestStatus = "REQUESTED" | "SUPPLIER_CONFIRMED" | "UNAVAILABLE" | "CANCELLED";
export type BookingChecklistState = "PENDING" | "CHECKED" | "NOT_APPLICABLE";

export interface BookingDocument {
  id: string;
  passengerId: string | null;
  bookingSupplierId: string | null;
  revisionRootId: string | null;
  fileName: string;
  fileType: string;
  fileSize: number | null;
  storageKey: string | null;
  category: string;
  notes: string | null;
  revisionNumber: number;
  createdAt: string;
  uploadedBy: SalePerson;
  passenger: { id: string; firstName: string; lastName: string } | null;
  bookingSupplier: { id: string; description: string | null; serviceType: string } | null;
}

export interface BookingDetail extends BookingSummary {
  customerId: string;
  leadId: string;
  saleSubmissionId: string;
  accountsStatus: string;
  folderStatus: string;
  finalServiceDate: string | null;
  sellingPrice?: string;
  supplierCost?: string | null;
  currency: string;
  folderReopenedAt?: string | null;
  folderReopenReason?: string | null;
  passengers: Array<{ id: string; firstName: string; lastName: string; dateOfBirth: string | null; nationality: string | null; passportNumber: string | null; passportExpiryDate: string | null; email: string | null; phone: string | null; isPrimaryPassenger: boolean; operationalNotes: string | null }>;
  suppliers: Array<{ id: string; sourceSaleProductId: string | null; category: SaleProductCategory | null; description: string | null; serviceStartDate: string | null; serviceEndDate: string | null; serviceType: string; supplierReference: string | null; estimatedSupplierCost: string | null; supplierCost?: string | null; currency: string | null; status: BookingProductStatus; notes: string | null; supplier: { id: string; name: string; supplierType: string }; issues: BookingProductIssue[] }>;
  references: Array<{ id: string; bookingSupplierId: string | null; type: string; reference: string; supplier: { id: string; name: string } | null; bookingSupplier: { id: string; description: string | null } | null }>;
  documents: BookingDocument[];
  specialRequests: Array<{ id: string; passengerId: string | null; bookingSupplierId: string | null; type: BookingSpecialRequestType; details: string; status: BookingSpecialRequestStatus; notes: string | null; confirmedAt: string | null; createdAt: string; passenger: { id: string; firstName: string; lastName: string } | null; bookingSupplier: { id: string; description: string | null; serviceType: string } | null; responsibleUser: SalePerson | null; createdBy: SalePerson; confirmedBy: SalePerson | null; history: Array<{ id: string; previousStatus: BookingSpecialRequestStatus | null; newStatus: BookingSpecialRequestStatus; notes: string | null; changedAt: string; changedBy: SalePerson }> }>;
  checklistItems: Array<{ id: string; itemType: string; state: BookingChecklistState; verificationNotes: string | null; verifiedAt: string | null; checkedBy: SalePerson | null; history: Array<{ id: string; previousState: BookingChecklistState | null; newState: BookingChecklistState; notes: string | null; changedAt: string; changedBy: SalePerson }> }>;
  notes: Array<{ id: string; content: string; createdAt: string; createdBy: SalePerson }>;
  tasks: Array<{ id: string; title: string; description: string | null; dueAt: string | null; status: string; assignedUser: SalePerson | null; createdBy: SalePerson }>;
  activity: Array<{ id: string; action: string; createdAt: string; oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null; actor: SalePerson }>;
  saleSubmission: {
    id: string;
    status: SaleSubmissionStatus;
    paymentType: BookingPaymentType | null;
    initialPaymentAmount: string | null;
    finalBalancePaymentDate: string | null;
    paymentArrangementNotes: string | null;
    salesNotes: string | null;
    passengerInformation: string | null;
    products: SaleSubmissionProduct[];
    paymentEntries: Array<Pick<SalePaymentEntry, "id" | "method" | "amount" | "paymentDate" | "status">>;
    installments: SaleInstallment[];
  };
}

export interface BookingListResponse {
  data: BookingSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
