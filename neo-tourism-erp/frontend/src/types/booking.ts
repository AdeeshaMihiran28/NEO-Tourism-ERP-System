import type { SalePerson } from "./sale";

export type BookingStatus = "NEW" | "IN_PROGRESS" | "READY" | "COMPLETED" | "CANCELLED";
export type TravelStatus = "UPCOMING" | "IN_TRAVEL" | "TRAVEL_COMPLETE" | "CANCELLED";
export type OperationsStatus = "PENDING" | "IN_PROGRESS" | "SUPPLIER_PENDING" | "TICKETING_PENDING" | "READY" | "COMPLETE" | "ACTION_REQUIRED";

export interface BookingSummary {
  id: string;
  folderNumber: string;
  destination: string;
  travelStartDate: string;
  travelEndDate: string | null;
  status: BookingStatus;
  travelStatus: TravelStatus;
  operationsStatus: OperationsStatus;
  customer: { id: string; firstName: string; lastName: string };
  salesAdvisor: SalePerson;
  operationsOwner: SalePerson | null;
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
  passengers: Array<{ id: string; firstName: string; lastName: string; dateOfBirth: string | null; nationality: string | null; passportNumber: string | null; passportExpiryDate: string | null; email: string | null; phone: string | null; isPrimaryPassenger: boolean }>;
  suppliers: Array<{ id: string; serviceType: string; supplierReference: string | null; supplierCost?: string | null; currency: string | null; status: string; notes: string | null; supplier: { id: string; name: string; supplierType: string } }>;
  references: Array<{ id: string; type: string; reference: string; supplier: { id: string; name: string } | null }>;
  documents: Array<{ id: string; fileName: string; fileType: string; storageKey: string; category: string; createdAt: string; uploadedBy: SalePerson }>;
  notes: Array<{ id: string; content: string; createdAt: string; createdBy: SalePerson }>;
  tasks: Array<{ id: string; title: string; description: string | null; dueAt: string | null; status: string; assignedUser: SalePerson | null; createdBy: SalePerson }>;
  activity: Array<{ id: string; action: string; createdAt: string; actor: SalePerson }>;
}

export interface BookingListResponse {
  data: BookingSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
