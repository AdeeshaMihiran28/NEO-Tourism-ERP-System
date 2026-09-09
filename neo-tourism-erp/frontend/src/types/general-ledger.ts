export type GlAccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

export interface GlAccount {
  id: string;
  code: string;
  name: string;
  type: GlAccountType;
  description: string | null;
  isActive: boolean;
  parentId: string | null;
}

export interface AccountingMapping {
  type: string;
  accountId: string;
  account: GlAccount;
}

export interface JournalLine {
  id: string;
  accountId: string;
  debit: string;
  credit: string;
  description: string | null;
  account: GlAccount;
}

export interface JournalEntry {
  id: string;
  journalNumber: string;
  journalDate: string;
  description: string;
  sourceType: string;
  sourceRecordId: string | null;
  currency: string;
  status: string;
  booking: { id: string; folderNumber: string; customerId: string } | null;
  lines: JournalLine[];
}

export interface LedgerRow {
  id: string;
  date: string;
  journalId: string;
  journalNumber: string;
  description: string;
  debit: string;
  credit: string;
  runningBalance: string;
  sourceType: string;
  sourceRecordId: string | null;
  account: GlAccount;
}

export interface TrialBalance {
  data: Array<GlAccount & { totalDebit: string; totalCredit: string; closingBalance: string }>;
  totalDebit: string;
  totalCredit: string;
  difference: string;
}
