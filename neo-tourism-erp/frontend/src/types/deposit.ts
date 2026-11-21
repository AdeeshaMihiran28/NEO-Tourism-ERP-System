import type { SalePerson } from "@/types/sale";

export type DepositRequestStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export interface DepositRequest {
  id: string;
  saleSubmissionId: string;
  customerId: string;
  leadId: string;
  requestedByUserId: string;
  destination: string;
  departureDate: string;
  arrivalDate: string | null;
  passengerCount: number;
  cancellationCost: string;
  netFare: string;
  sellingFare: string;
  initialPaymentAmount: string;
  balancePaymentDate: string;
  currency: string;
  arrangementNotes: string | null;
  status: DepositRequestStatus;
  decidedAt: string | null;
  decisionNotes: string | null;
  createdAt: string;
  customer: { id: string; firstName: string; lastName: string };
  requestedBy: SalePerson;
  decidedBy: SalePerson | null;
  saleSubmission: {
    id: string;
    status: string;
    salesNotes: string | null;
    paymentArrangementNotes: string | null;
    products: Array<{
      id: string;
      description: string;
      attachments: Array<{ id: string; fileName: string }>;
    }>;
    paymentEntries: Array<{
      id: string;
      evidence: Array<{ id: string; fileName: string }>;
    }>;
  };
}

export function depositStatusLabel(status: DepositRequestStatus) {
  return status.replaceAll("_", " ");
}
