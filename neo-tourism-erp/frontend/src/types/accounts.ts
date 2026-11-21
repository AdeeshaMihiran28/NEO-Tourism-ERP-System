import type { SalePerson } from "./sale";

export interface FinancialSummary {
  sellingPrice: string;
  supplierCost: string;
  fees: string;
  discounts: string;
  refunds: string;
  adjustments: string;
  passengerPaymentsReceived: string;
  supplierPaymentsMade: string;
  expectedRevenue: string;
  expectedProfit: string;
  passengerBalance: string;
  supplierBalance: string;
  currency: string;
  invoicedAmount: string;
  customerAdvances: string;
  allocatedCustomerAdvances: string;
  customerOutstanding: string;
  supplierInvoiceAmount: string;
  supplierAdvances: string;
  allocatedSupplierAdvances: string;
  supplierOutstanding: string;
  grossProfit: string;
  grossMargin: string;
  surcharge: string | null;
  initialProfit: string | null;
  balancedProfit: string | null;
  totalProfit: string | null;
  adminProfit: string | null;
}
export interface Payment {
  id: string;
  amount: string;
  currency: string;
  paymentReference: string | null;
  paymentDate: string;
  dueDate: string | null;
  recordedGbpAmount: string | null;
  recordedGbpRate: string | null;
  transactionFee: string | null;
  feeCurrency: string | null;
  status: string;
  paymentMethod?: string;
  recordedBy: SalePerson;
  verifiedBy: SalePerson | null;
  bookingSupplier?: { supplier: { name: string } };
  fundingBreakdowns?: SupplierPaymentFunding[];
  evidence?: PaymentEvidence[];
}

export interface SupplierPaymentFunding {
  id: string;
  sourceAmount: string;
  sourceCurrency: string;
  feeAmount: string | null;
  feeCurrency: string | null;
  recordedConversionRate: string | null;
  convertedAmount: string | null;
  convertedCurrency: string | null;
  reference: string | null;
  notes: string | null;
}

export interface PaymentEvidence {
  id: string;
  fileName: string;
  fileType: string;
  storageKey: string;
  createdAt: string;
}

export interface SupplierPaymentDetail extends Payment {
  fundingBreakdowns: SupplierPaymentFunding[];
  evidence: PaymentEvidence[];
}

export interface PassengerPaymentDetail extends Payment {
  evidence: PaymentEvidence[];
}

export interface VoucherEntry {
  id: string;
  entryType: "REVENUE" | "SURCHARGE" | "SUPPLIER_COST" | "OTHER";
  amount: string;
  currency: string;
  bookingSupplierId: string | null;
  passengerPaymentId: string | null;
  supplierPaymentId: string | null;
  paymentReference: string | null;
  notes: string | null;
}

export interface BookingVoucher {
  id: string;
  voucherReference: string;
  voucherNumber: string | null;
  transactionDate: string;
  status: string;
  notes: string | null;
  createdBy: SalePerson;
  entries: VoucherEntry[];
  evidence: PaymentEvidence[];
}
export interface FinanceInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  currency: string;
  totalAmount: string;
  netAmount: string;
  taxAmount: string;
  exchangeRate: string;
  baseCurrency: string;
  baseTotalAmount: string;
  amountPaid: string;
  outstanding: string;
  status: string;
  ageingBucket: string | null;
  supplier?: { name: string };
}
export interface FinanceAdvance {
  id: string;
  amount: string;
  originalAmount: string;
  allocatedAmount: string;
  remainingAmount: string;
  currency: string;
  paymentReference: string | null;
  paymentDate: string;
  supplier?: { name: string };
}
export interface Adjustment {
  id: string;
  type: string;
  amount: string;
  currency: string;
  reason: string;
  approvedAt: string | null;
}
export interface Discrepancy {
  id: string;
  type: string;
  description: string;
  amountDifference: string | null;
  currency: string | null;
  status: string;
  createdAt: string;
  assignedUser: SalePerson | null;
  booking: {
    id: string;
    folderNumber: string;
    currency: string;
    customer: { firstName: string; lastName: string };
  };
}
export interface Reconciliation {
  id: string;
  status: string;
  notes: string | null;
  reconciledAt: string | null;
  reconciledBy: SalePerson | null;
  discrepancies: Discrepancy[];
  passengerPaymentsVerified: boolean;
  supplierCostsVerified: boolean;
  supplierPaymentsVerified: boolean;
  sellingPriceVerified: boolean;
  feesVerified: boolean;
  adjustmentsVerified: boolean;
  profitVerified: boolean;
}
export interface AccountsQueueItem {
  id: string;
  folderNumber: string;
  travelStartDate: string;
  travelEndDate: string | null;
  sellingPrice: string;
  currency: string;
  accountsStatus: string;
  createdAt: string;
  customer: { firstName: string; lastName: string };
  salesAdvisor: SalePerson;
  reconciliation: { status: string } | null;
  finance?: { expectedProfit: string } | null;
  reconciledAt?: string | null;
  reconciledBy?: SalePerson | null;
}
export interface Paged<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
