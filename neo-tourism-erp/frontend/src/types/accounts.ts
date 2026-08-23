import type { SalePerson } from "./sale";

export interface FinancialSummary {
  sellingPrice: string; supplierCost: string; fees: string; discounts: string;
  adjustments: string; passengerPaymentsReceived: string; supplierPaymentsMade: string;
  expectedRevenue: string; expectedProfit: string; passengerBalance: string;
  supplierBalance: string; currency: string;
}
export interface Payment {
  id: string; amount: string; currency: string; paymentReference: string | null;
  paymentDate: string; status: string; paymentMethod?: string; recordedBy: SalePerson;
  verifiedBy: SalePerson | null; bookingSupplier?: { supplier: { name: string } };
}
export interface Adjustment { id: string; type: string; amount: string; currency: string; reason: string; approvedAt: string | null; }
export interface Discrepancy { id: string; type: string; description: string; amountDifference: string | null; currency: string | null; status: string; createdAt: string; assignedUser: SalePerson | null; booking: { id: string; folderNumber: string; currency: string; customer: { firstName: string; lastName: string } }; }
export interface Reconciliation {
  id: string; status: string; notes: string | null; reconciledAt: string | null;
  reconciledBy: SalePerson | null; discrepancies: Discrepancy[];
  passengerPaymentsVerified: boolean; supplierCostsVerified: boolean;
  supplierPaymentsVerified: boolean; sellingPriceVerified: boolean;
  feesVerified: boolean; adjustmentsVerified: boolean; profitVerified: boolean;
}
export interface AccountsQueueItem {
  id: string; folderNumber: string; travelStartDate: string; travelEndDate: string | null;
  sellingPrice: string; currency: string; accountsStatus: string; createdAt: string;
  customer: { firstName: string; lastName: string }; salesAdvisor: SalePerson;
  reconciliation: { status: string } | null;
  finance?: { expectedProfit: string } | null;
  reconciledAt?: string | null; reconciledBy?: SalePerson | null;
}
export interface Paged<T> { data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } }
