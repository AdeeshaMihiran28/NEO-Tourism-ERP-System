export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  maskedAccountNumber: string;
  currency: string;
  branch: string | null;
  accountType: string;
  openingBalance: string;
  isActive: boolean;
  glAccountId?: string | null;
  calculatedBalance?: string;
}

export interface BankTransaction {
  id: string;
  transactionDate: string;
  amount: string;
  currency: string;
  direction: "CREDIT" | "DEBIT";
  reference: string | null;
  description: string;
  sourceType: string;
  status: string;
  reconciliationState: string;
  booking?: { id: string; folderNumber: string } | null;
}

export interface BankStatement {
  id: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: string;
  closingBalance: string;
  status: string;
}

export interface StatementTransaction {
  id: string;
  transactionDate: string;
  amount: string;
  direction: "CREDIT" | "DEBIT";
  reference: string | null;
  description: string;
  matchingStatus: string;
  matches: Array<{ id: string; erpBankTransaction: BankTransaction }>;
}

export interface StatementDetail extends BankStatement {
  transactions: StatementTransaction[];
  summary: {
    openingBalance: string;
    erpOpeningBalance: string;
    statementClosingBalance: string;
    erpCredits: string;
    erpDebits: string;
    calculatedClosingBalance: string;
    difference: string;
    matchedCredits: string;
    matchedDebits: string;
    unmatchedErpTransactions: BankTransaction[];
    unmatchedStatementTransactions: StatementTransaction[];
  };
}
