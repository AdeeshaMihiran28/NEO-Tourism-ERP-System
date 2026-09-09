export type ExchangeRate = {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveDate: string;
  source: string;
  isActive: boolean;
};

export type TaxCode = {
  id: string;
  code: string;
  name: string;
  rate: string;
  taxType: string;
  classification: "OUTPUT" | "INPUT" | "NONE";
  effectiveFrom: string;
  isRecoverable: boolean;
  isActive: boolean;
  glAccountId?: string;
};

export type AccountingPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  fiscalYear: number;
  status: "OPEN" | "CLOSING" | "CLOSED" | "LOCKED";
  validationResult?: Record<string, unknown>;
};

export type ReportResult = Record<string, unknown> | unknown[];
