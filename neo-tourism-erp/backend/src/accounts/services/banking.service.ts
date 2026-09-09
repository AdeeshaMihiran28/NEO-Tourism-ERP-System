import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { AuditService } from '../../audit/audit.service';
import type { RequestMetadata } from '../../common/request-metadata';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateBankAccountDto,
  CreateBankStatementDto,
  CreateBankTransferDto,
  CreateManualBankTransactionDto,
  ImportStatementTransactionsDto,
  MatchBankTransactionDto,
  ReasonDto,
  UpdateBankAccountDto,
} from '../dto/banking.dto';
import { GeneralLedgerService } from './general-ledger.service';
import { AccountingControlsService } from './accounting-controls.service';

@Injectable()
export class BankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: GeneralLedgerService,
    private readonly controls: AccountingControlsService,
  ) {}

  listAccounts(activeOnly = true) {
    return this.prisma.companyBankAccount.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: { glAccount: true },
      orderBy: [{ bankName: 'asc' }, { accountName: 'asc' }],
    });
  }

  async getAccount(id: string) {
    const account = await this.prisma.companyBankAccount.findUnique({
      where: { id },
      include: { glAccount: true },
    });
    if (!account) throw new NotFoundException('Bank account not found.');
    return { ...account, calculatedBalance: await this.balance(id) };
  }

  async createAccount(
    dto: CreateBankAccountDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const glAccountId =
        dto.glAccountId ??
        (
          await tx.accountingMapping.findUnique({
            where: { type: 'BANK_CONTROL' },
          })
        )?.accountId;
      if (!glAccountId)
        throw new ConflictException('No default bank GL mapping exists.');
      const glAccount = await tx.glAccount.findUnique({
        where: { id: glAccountId },
      });
      if (!glAccount?.isActive || glAccount.type !== 'ASSET')
        throw new BadRequestException(
          'Bank GL account must be an active asset.',
        );
      const value = await tx.companyBankAccount.create({
        data: {
          bankName: dto.bankName.trim(),
          accountName: dto.accountName.trim(),
          maskedAccountNumber: this.maskAccountNumber(dto.accountNumber),
          currency: dto.currency.toUpperCase(),
          branch: dto.branch?.trim(),
          accountType: dto.accountType,
          openingBalance: new Prisma.Decimal(dto.openingBalance ?? 0),
          createdById: user.id,
          updatedById: user.id,
          glAccountId,
        },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'CompanyBankAccount',
        value.id,
        'BANK_ACCOUNT_CREATED',
        value,
      );
      return value;
    });
  }

  async updateAccount(
    id: string,
    dto: UpdateBankAccountDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const old = await this.prisma.companyBankAccount.findUnique({
      where: { id },
    });
    if (!old) throw new NotFoundException('Bank account not found.');
    if (dto.currency && dto.currency.toUpperCase() !== old.currency) {
      const used = await this.prisma.bankTransaction.count({
        where: { companyBankAccountId: id },
      });
      if (used)
        throw new ConflictException(
          'Currency cannot change after bank transactions exist.',
        );
    }
    if (dto.glAccountId) {
      const glAccount = await this.prisma.glAccount.findUnique({
        where: { id: dto.glAccountId },
      });
      if (!glAccount?.isActive || glAccount.type !== 'ASSET')
        throw new BadRequestException(
          'Bank GL account must be an active asset.',
        );
    }
    const { accountNumber, ...changes } = dto;
    return this.prisma.$transaction(async (tx) => {
      const value = await tx.companyBankAccount.update({
        where: { id },
        data: {
          ...changes,
          ...(accountNumber && {
            maskedAccountNumber: this.maskAccountNumber(accountNumber),
          }),
          ...(dto.bankName && { bankName: dto.bankName.trim() }),
          ...(dto.accountName && { accountName: dto.accountName.trim() }),
          ...(dto.branch && { branch: dto.branch.trim() }),
          ...(dto.currency && { currency: dto.currency.toUpperCase() }),
          updatedById: user.id,
        },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'CompanyBankAccount',
        id,
        value.isActive ? 'BANK_ACCOUNT_UPDATED' : 'BANK_ACCOUNT_DEACTIVATED',
        value,
      );
      return value;
    });
  }

  async listTransactions(accountId: string) {
    await this.assertAccount(accountId, false);
    return this.prisma.bankTransaction.findMany({
      where: { companyBankAccountId: accountId },
      include: {
        booking: { select: { id: true, folderNumber: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
      take: 1000,
    });
  }

  async createManualTransaction(
    accountId: string,
    dto: CreateManualBankTransactionDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    if (
      !['BANK_CHARGE', 'INTEREST', 'MANUAL_ADJUSTMENT'].includes(dto.sourceType)
    )
      throw new BadRequestException(
        'Only bank charges, interest, and manual adjustments are allowed here.',
      );
    const account = await this.assertAccount(accountId);
    return this.prisma.$transaction(async (tx) => {
      const transactionDate = new Date(dto.transactionDate);
      await this.controls.assertOpenPeriod(tx, transactionDate);
      const valuation = await this.controls.valuation(
        tx,
        dto.amount,
        account.currency,
        transactionDate,
      );
      const value = await tx.bankTransaction.create({
        data: {
          companyBankAccountId: accountId,
          transactionDate,
          amount: new Prisma.Decimal(dto.amount),
          currency: account.currency,
          exchangeRate: valuation.exchangeRate,
          baseCurrency: valuation.baseCurrency,
          baseAmount: valuation.baseAmount,
          direction: dto.direction,
          reference: dto.reference,
          description: dto.description,
          sourceType: dto.sourceType,
          createdById: user.id,
        },
      });
      if (dto.sourceType === 'BANK_CHARGE') {
        if (dto.direction !== 'DEBIT')
          throw new BadRequestException(
            'A bank charge must debit the bank account.',
          );
        await this.ledger.postAutomatic(
          tx,
          {
            sourceType: 'BANK_CHARGE',
            sourceRecordId: value.id,
            date: value.transactionDate,
            description: value.description,
            currency: value.currency,
            lines: [
              { mapping: 'BANK_CHARGES', debit: value.amount },
              { bankAccountId: accountId, credit: value.amount },
            ],
          },
          user,
          metadata,
        );
      } else if (dto.sourceType === 'MANUAL_ADJUSTMENT') {
        await this.ledger.postAutomatic(
          tx,
          {
            sourceType: 'BANK_ADJUSTMENT',
            sourceRecordId: value.id,
            date: value.transactionDate,
            description: value.description,
            currency: value.currency,
            lines:
              dto.direction === 'DEBIT'
                ? [
                    { mapping: 'BANK_ADJUSTMENTS', debit: value.amount },
                    { bankAccountId: accountId, credit: value.amount },
                  ]
                : [
                    { bankAccountId: accountId, debit: value.amount },
                    { mapping: 'BANK_ADJUSTMENTS', credit: value.amount },
                  ],
          },
          user,
          metadata,
        );
      }
      await this.auditEvent(
        tx,
        user,
        metadata,
        'BankTransaction',
        value.id,
        dto.sourceType === 'MANUAL_ADJUSTMENT'
          ? 'MANUAL_BANK_ADJUSTMENT_CREATED'
          : 'BANK_TRANSACTION_CREATED',
        value,
      );
      return value;
    });
  }

  async transfer(
    dto: CreateBankTransferDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    if (dto.sourceAccountId === dto.destinationAccountId)
      throw new BadRequestException(
        'Source and destination accounts must differ.',
      );
    const [source, destination] = await Promise.all([
      this.assertAccount(dto.sourceAccountId),
      this.assertAccount(dto.destinationAccountId),
    ]);
    if (source.currency !== destination.currency)
      throw new BadRequestException(
        'Cross-currency bank transfers are not supported.',
      );
    const transferId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const transactionDate = new Date(dto.transactionDate);
      await this.controls.assertOpenPeriod(tx, transactionDate);
      const valuation = await this.controls.valuation(
        tx,
        dto.amount,
        source.currency,
        transactionDate,
      );
      const values = await Promise.all([
        tx.bankTransaction.create({
          data: {
            companyBankAccountId: source.id,
            transactionDate,
            amount: new Prisma.Decimal(dto.amount),
            currency: source.currency,
            exchangeRate: valuation.exchangeRate,
            baseCurrency: valuation.baseCurrency,
            baseAmount: valuation.baseAmount,
            direction: 'DEBIT',
            reference: dto.reference,
            description:
              dto.description ?? `Transfer to ${destination.accountName}`,
            sourceType: 'BANK_TRANSFER',
            transferId,
            createdById: user.id,
          },
        }),
        tx.bankTransaction.create({
          data: {
            companyBankAccountId: destination.id,
            transactionDate,
            amount: new Prisma.Decimal(dto.amount),
            currency: destination.currency,
            exchangeRate: valuation.exchangeRate,
            baseCurrency: valuation.baseCurrency,
            baseAmount: valuation.baseAmount,
            direction: 'CREDIT',
            reference: dto.reference,
            description:
              dto.description ?? `Transfer from ${source.accountName}`,
            sourceType: 'BANK_TRANSFER',
            transferId,
            createdById: user.id,
          },
        }),
      ]);
      await this.auditEvent(
        tx,
        user,
        metadata,
        'BankTransfer',
        transferId,
        'BANK_TRANSFER_CREATED',
        {
          transferId,
          sourceAccountId: source.id,
          destinationAccountId: destination.id,
          amount: dto.amount,
          currency: source.currency,
          reference: dto.reference,
        },
      );
      return { transferId, transactions: values };
    });
  }

  async linkCustomerReceipt(
    tx: Prisma.TransactionClient,
    payment: {
      id: string;
      bookingId: string;
      amount: Prisma.Decimal;
      currency: string;
      paymentDate: Date;
      paymentReference: string | null;
      paymentMethod: string;
      recordedById: string;
      exchangeRate: Prisma.Decimal;
      baseCurrency: string;
      baseAmount: Prisma.Decimal;
    },
    bankAccountId: string | undefined,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    if (payment.paymentMethod !== 'BANK_TRANSFER') return;
    if (!bankAccountId)
      throw new BadRequestException(
        'Company bank account is required for a bank transfer receipt.',
      );
    const account = await this.assertAccount(bankAccountId, true, tx);
    this.assertCurrency(account.currency, payment.currency);
    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: payment.bookingId },
      select: { customerId: true },
    });
    try {
      const value = await tx.bankTransaction.create({
        data: {
          companyBankAccountId: bankAccountId,
          transactionDate: payment.paymentDate,
          amount: payment.amount,
          currency: payment.currency,
          exchangeRate: payment.exchangeRate,
          baseCurrency: payment.baseCurrency,
          baseAmount: payment.baseAmount,
          direction: 'CREDIT',
          reference: payment.paymentReference,
          description: 'Customer receipt',
          sourceType: 'CUSTOMER_RECEIPT',
          passengerPaymentId: payment.id,
          bookingId: payment.bookingId,
          customerId: booking.customerId,
          createdById: payment.recordedById,
        },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'BankTransaction',
        value.id,
        'CUSTOMER_RECEIPT_BANK_LINKED',
        value,
      );
    } catch (error) {
      this.throwDuplicateSource(error);
    }
  }

  async linkSupplierPayment(
    tx: Prisma.TransactionClient,
    payment: {
      id: string;
      bookingId: string;
      bookingSupplierId: string;
      amount: Prisma.Decimal;
      currency: string;
      paymentDate: Date;
      paymentReference: string | null;
      paymentMethod: string;
      recordedById: string;
      exchangeRate: Prisma.Decimal;
      baseCurrency: string;
      baseAmount: Prisma.Decimal;
    },
    bankAccountId: string | undefined,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    if (payment.paymentMethod !== 'BANK_TRANSFER') return;
    if (!bankAccountId)
      throw new BadRequestException(
        'Company bank account is required for a bank transfer supplier payment.',
      );
    const account = await this.assertAccount(bankAccountId, true, tx);
    this.assertCurrency(account.currency, payment.currency);
    const supplier = await tx.bookingSupplier.findUniqueOrThrow({
      where: { id: payment.bookingSupplierId },
      select: { supplierId: true },
    });
    try {
      const value = await tx.bankTransaction.create({
        data: {
          companyBankAccountId: bankAccountId,
          transactionDate: payment.paymentDate,
          amount: payment.amount,
          currency: payment.currency,
          exchangeRate: payment.exchangeRate,
          baseCurrency: payment.baseCurrency,
          baseAmount: payment.baseAmount,
          direction: 'DEBIT',
          reference: payment.paymentReference,
          description: 'Supplier payment',
          sourceType: 'SUPPLIER_PAYMENT',
          supplierPaymentId: payment.id,
          bookingId: payment.bookingId,
          supplierId: supplier.supplierId,
          createdById: payment.recordedById,
        },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'BankTransaction',
        value.id,
        'SUPPLIER_PAYMENT_BANK_LINKED',
        value,
      );
    } catch (error) {
      this.throwDuplicateSource(error);
    }
  }

  async assertSourcePaymentEditable(
    tx: Prisma.TransactionClient,
    kind: 'customer' | 'supplier',
    id: string,
  ) {
    const bankTransaction =
      kind === 'customer'
        ? await tx.bankTransaction.findUnique({
            where: { passengerPaymentId: id },
          })
        : await tx.bankTransaction.findUnique({
            where: { supplierPaymentId: id },
          });
    if (bankTransaction)
      throw new ConflictException(
        'A bank-linked payment cannot be edited; reverse and record a corrected payment.',
      );
  }

  async reverseSourcePayment(
    tx: Prisma.TransactionClient,
    kind: 'customer' | 'supplier',
    id: string,
  ) {
    const bankTransaction =
      kind === 'customer'
        ? await tx.bankTransaction.findUnique({
            where: { passengerPaymentId: id },
          })
        : await tx.bankTransaction.findUnique({
            where: { supplierPaymentId: id },
          });
    if (!bankTransaction) return;
    const matched = await tx.bankReconciliationMatch.count({
      where: { erpBankTransactionId: bankTransaction.id, unmatchedAt: null },
    });
    if (matched)
      throw new ConflictException(
        'Unmatch the bank transaction before reversing its source payment.',
      );
    await tx.bankTransaction.update({
      where: { id: bankTransaction.id },
      data: { status: 'REVERSED', reconciliationState: 'UNMATCHED' },
    });
  }

  async createStatement(
    dto: CreateBankStatementDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const account = await this.assertAccount(dto.companyBankAccountId, false);
    if (new Date(dto.periodStart) > new Date(dto.periodEnd))
      throw new BadRequestException(
        'Statement period start must not be after its end.',
      );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const overlapping = await tx.bankStatement.count({
            where: {
              companyBankAccountId: account.id,
              periodStart: { lte: new Date(dto.periodEnd) },
              periodEnd: { gte: new Date(dto.periodStart) },
            },
          });
          if (overlapping)
            throw new ConflictException(
              'A bank statement already overlaps this account and period.',
            );
          const value = await tx.bankStatement.create({
            data: {
              companyBankAccountId: account.id,
              periodStart: new Date(dto.periodStart),
              periodEnd: new Date(dto.periodEnd),
              openingBalance: new Prisma.Decimal(dto.openingBalance),
              closingBalance: new Prisma.Decimal(dto.closingBalance),
              createdById: user.id,
            },
          });
          await this.auditEvent(
            tx,
            user,
            metadata,
            'BankStatement',
            value.id,
            'BANK_STATEMENT_CREATED',
            value,
          );
          return value;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'A statement already exists for this account and period.',
        );
      throw error;
    }
  }

  listStatements(accountId: string) {
    return this.prisma.bankStatement.findMany({
      where: { companyBankAccountId: accountId },
      orderBy: { periodStart: 'desc' },
    });
  }

  async importStatementRows(
    statementId: string,
    dto: ImportStatementTransactionsDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const statement = await this.statement(statementId);
    this.assertStatementEditable(statement.status);
    const rows = dto.rows.map((row) => ({
      ...row,
      fingerprint: this.fingerprint(statement.companyBankAccountId, row),
    }));
    const duplicate = await this.prisma.bankStatementTransaction.findFirst({
      where: { fingerprint: { in: rows.map((row) => row.fingerprint) } },
    });
    if (
      duplicate ||
      new Set(rows.map((row) => row.fingerprint)).size !== rows.length
    )
      throw new ConflictException(
        'Duplicate or ambiguous statement transaction detected.',
      );
    return this.prisma.$transaction(async (tx) => {
      const values = [];
      for (const row of rows)
        values.push(
          await tx.bankStatementTransaction.create({
            data: {
              statementId,
              transactionDate: new Date(row.transactionDate),
              valueDate: row.valueDate ? new Date(row.valueDate) : undefined,
              description: row.description,
              reference: row.reference,
              amount: new Prisma.Decimal(row.amount),
              direction: row.direction,
              balance: row.balance
                ? new Prisma.Decimal(row.balance)
                : undefined,
              fingerprint: row.fingerprint,
            },
          }),
        );
      await tx.bankStatement.update({
        where: { id: statementId },
        data: { status: 'IN_REVIEW' },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'BankStatement',
        statementId,
        'BANK_STATEMENT_IMPORTED',
        { transactionCount: values.length },
      );
      return values;
    });
  }

  async getStatement(id: string) {
    await this.statement(id);
    const [statement, summary] = await Promise.all([
      this.prisma.bankStatement.findUniqueOrThrow({
        where: { id },
        include: {
          companyBankAccount: true,
          transactions: {
            include: {
              matches: {
                where: { unmatchedAt: null },
                include: { erpBankTransaction: true },
              },
            },
            orderBy: { transactionDate: 'asc' },
          },
          finalizedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.reconciliationSummary(id),
    ]);
    return { ...statement, summary };
  }

  async autoMatch(
    statementId: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const statement = await this.statement(statementId);
    this.assertStatementEditable(statement.status);
    const rows = await this.prisma.bankStatementTransaction.findMany({
      where: { statementId, matchingStatus: 'UNMATCHED' },
    });
    let matched = 0;
    for (const row of rows) {
      const from = new Date(row.transactionDate);
      from.setDate(from.getDate() - 3);
      const to = new Date(row.transactionDate);
      to.setDate(to.getDate() + 3);
      const candidates = await this.prisma.bankTransaction.findMany({
        where: {
          companyBankAccountId: statement.companyBankAccountId,
          transactionDate: { gte: from, lte: to },
          amount: row.amount,
          direction: row.direction,
          status: 'POSTED',
          reconciliationState: 'UNMATCHED',
          ...(row.reference && {
            reference: { equals: row.reference, mode: 'insensitive' },
          }),
        },
        take: 2,
      });
      if (candidates.length === 1) {
        await this.match(
          row.id,
          { erpBankTransactionId: candidates[0].id },
          user,
          metadata,
        );
        matched++;
      }
    }
    return { matched };
  }

  async match(
    statementTransactionId: string,
    dto: MatchBankTransactionDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.bankStatementTransaction.findUnique({
          where: { id: statementTransactionId },
          include: { statement: true },
        });
        const erp = await tx.bankTransaction.findUnique({
          where: { id: dto.erpBankTransactionId },
        });
        if (!row || !erp)
          throw new NotFoundException(
            'Statement or ERP transaction not found.',
          );
        this.assertStatementEditable(row.statement.status);
        if (
          row.statement.companyBankAccountId !== erp.companyBankAccountId ||
          row.direction !== erp.direction ||
          !row.amount.equals(erp.amount)
        )
          throw new BadRequestException(
            'Transactions must have the same account, direction, and amount.',
          );
        if (erp.status !== 'POSTED')
          throw new ConflictException(
            'Only posted ERP bank transactions can be matched.',
          );
        if (
          row.matchingStatus !== 'UNMATCHED' ||
          erp.reconciliationState !== 'UNMATCHED'
        )
          throw new ConflictException(
            'One of these transactions is already matched.',
          );
        const value = await tx.bankReconciliationMatch.create({
          data: {
            erpBankTransactionId: erp.id,
            statementTransactionId: row.id,
            matchedById: user.id,
          },
        });
        await Promise.all([
          tx.bankStatementTransaction.update({
            where: { id: row.id },
            data: { matchingStatus: 'MATCHED' },
          }),
          tx.bankTransaction.update({
            where: { id: erp.id },
            data: { reconciliationState: 'MATCHED' },
          }),
          tx.bankStatement.update({
            where: { id: row.statementId },
            data: { status: 'IN_REVIEW' },
          }),
        ]);
        await this.auditEvent(
          tx,
          user,
          metadata,
          'BankReconciliationMatch',
          value.id,
          'BANK_TRANSACTION_MATCHED',
          value,
        );
        return value;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async unmatch(
    matchId: string,
    dto: ReasonDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.bankReconciliationMatch.findUnique({
        where: { id: matchId },
        include: { statementTransaction: { include: { statement: true } } },
      });
      if (!old) throw new NotFoundException('Reconciliation match not found.');
      if (old.unmatchedAt)
        throw new ConflictException('Transaction is already unmatched.');
      this.assertStatementEditable(old.statementTransaction.statement.status);
      const value = await tx.bankReconciliationMatch.update({
        where: { id: matchId },
        data: {
          unmatchedAt: new Date(),
          unmatchedById: user.id,
          unmatchReason: dto.reason,
        },
      });
      await Promise.all([
        tx.bankStatementTransaction.update({
          where: { id: old.statementTransactionId },
          data: { matchingStatus: 'UNMATCHED' },
        }),
        tx.bankTransaction.update({
          where: { id: old.erpBankTransactionId },
          data: { reconciliationState: 'UNMATCHED' },
        }),
      ]);
      await this.auditEvent(
        tx,
        user,
        metadata,
        'BankReconciliationMatch',
        matchId,
        'BANK_TRANSACTION_UNMATCHED',
        value,
      );
      return value;
    });
  }

  async reconciliationSummary(statementId: string) {
    const statement = await this.statement(statementId);
    const [erp, prior, statementRows, account] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where: {
          companyBankAccountId: statement.companyBankAccountId,
          transactionDate: {
            gte: statement.periodStart,
            lte: statement.periodEnd,
          },
          status: 'POSTED',
        },
      }),
      this.prisma.bankTransaction.findMany({
        where: {
          companyBankAccountId: statement.companyBankAccountId,
          transactionDate: { lt: statement.periodStart },
          status: 'POSTED',
        },
        select: { amount: true, direction: true },
      }),
      this.prisma.bankStatementTransaction.findMany({ where: { statementId } }),
      this.prisma.companyBankAccount.findUniqueOrThrow({
        where: { id: statement.companyBankAccountId },
      }),
    ]);
    const credits = this.total(erp.filter((row) => row.direction === 'CREDIT'));
    const debits = this.total(erp.filter((row) => row.direction === 'DEBIT'));
    const erpOpeningBalance = account.openingBalance
      .plus(this.total(prior.filter((row) => row.direction === 'CREDIT')))
      .minus(this.total(prior.filter((row) => row.direction === 'DEBIT')));
    const calculatedClosingBalance = erpOpeningBalance
      .plus(credits)
      .minus(debits);
    return {
      openingBalance: statement.openingBalance,
      erpOpeningBalance,
      statementClosingBalance: statement.closingBalance,
      erpCredits: credits,
      erpDebits: debits,
      calculatedClosingBalance,
      difference: statement.closingBalance.minus(calculatedClosingBalance),
      matchedCredits: this.total(
        erp.filter(
          (row) =>
            row.direction === 'CREDIT' &&
            row.reconciliationState !== 'UNMATCHED',
        ),
      ),
      matchedDebits: this.total(
        erp.filter(
          (row) =>
            row.direction === 'DEBIT' &&
            row.reconciliationState !== 'UNMATCHED',
        ),
      ),
      unmatchedErpTransactions: erp.filter(
        (row) => row.reconciliationState === 'UNMATCHED',
      ),
      unmatchedStatementTransactions: statementRows.filter(
        (row) => row.matchingStatus === 'UNMATCHED',
      ),
    };
  }

  async finalize(
    statementId: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const statement = await this.statement(statementId);
    this.assertStatementEditable(statement.status);
    const summary = await this.reconciliationSummary(statementId);
    if (
      !summary.difference.isZero() ||
      summary.unmatchedErpTransactions.length ||
      summary.unmatchedStatementTransactions.length
    ) {
      await this.prisma.bankStatement.update({
        where: { id: statementId },
        data: { status: 'ACTION_REQUIRED' },
      });
      throw new ConflictException(
        'Resolve every unmatched transaction and the reconciliation difference before finalizing.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const matches = await tx.bankReconciliationMatch.findMany({
        where: { statementTransaction: { statementId }, unmatchedAt: null },
      });
      await Promise.all([
        tx.bankTransaction.updateMany({
          where: {
            id: { in: matches.map((match) => match.erpBankTransactionId) },
          },
          data: { reconciliationState: 'RECONCILED' },
        }),
        tx.bankStatementTransaction.updateMany({
          where: { statementId },
          data: { matchingStatus: 'RECONCILED' },
        }),
      ]);
      const value = await tx.bankStatement.update({
        where: { id: statementId },
        data: {
          status: 'RECONCILED',
          finalizedById: user.id,
          finalizedAt: new Date(),
        },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'BankStatement',
        statementId,
        'BANK_RECONCILIATION_FINALIZED',
        value,
      );
      return value;
    });
  }

  async reopen(
    statementId: string,
    dto: ReasonDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const old = await this.statement(statementId);
    if (old.status !== 'RECONCILED')
      throw new ConflictException(
        'Only a finalized reconciliation can be reopened.',
      );
    return this.prisma.$transaction(async (tx) => {
      const value = await tx.bankStatement.update({
        where: { id: statementId },
        data: {
          status: 'IN_REVIEW',
          reopenedById: user.id,
          reopenedAt: new Date(),
          reopenReason: dto.reason,
          finalizedById: null,
          finalizedAt: null,
        },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'BankStatement',
        statementId,
        'BANK_RECONCILIATION_REOPENED',
        value,
      );
      return value;
    });
  }

  async balance(accountId: string) {
    const account = await this.assertAccount(accountId, false);
    const rows = await this.prisma.bankTransaction.findMany({
      where: { companyBankAccountId: accountId, status: 'POSTED' },
      select: { amount: true, direction: true },
    });
    return account.openingBalance
      .plus(this.total(rows.filter((row) => row.direction === 'CREDIT')))
      .minus(this.total(rows.filter((row) => row.direction === 'DEBIT')));
  }

  private async statement(id: string) {
    const value = await this.prisma.bankStatement.findUnique({ where: { id } });
    if (!value) throw new NotFoundException('Bank statement not found.');
    return value;
  }

  private assertStatementEditable(status: string) {
    if (status === 'RECONCILED')
      throw new ConflictException(
        'Reopen the finalized reconciliation before changing it.',
      );
  }

  private async assertAccount(
    id: string,
    active = true,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const value = await client.companyBankAccount.findUnique({ where: { id } });
    if (!value || (active && !value.isActive))
      throw new BadRequestException('Bank account is invalid or inactive.');
    return value;
  }

  private assertCurrency(expected: string, actual: string) {
    if (expected.toUpperCase() !== actual.toUpperCase())
      throw new BadRequestException(
        'Bank account and transaction currencies must match.',
      );
  }

  private maskAccountNumber(value: string) {
    const compact = value.replace(/\s+/g, '');
    return `•••• ${compact.slice(-4)}`;
  }

  private fingerprint(
    accountId: string,
    row: {
      transactionDate: string;
      valueDate?: string;
      description: string;
      reference?: string;
      amount: string;
      direction: string;
    },
  ) {
    return createHash('sha256')
      .update(
        [
          accountId,
          row.transactionDate,
          row.valueDate ?? '',
          row.direction,
          new Prisma.Decimal(row.amount).toFixed(2),
          row.reference?.trim().toLowerCase() ?? '',
          row.description.trim().toLowerCase(),
        ].join('|'),
      )
      .digest('hex');
  }

  private total(rows: { amount: Prisma.Decimal }[]) {
    return rows.reduce(
      (sum, row) => sum.plus(row.amount),
      new Prisma.Decimal(0),
    );
  }

  private throwDuplicateSource(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(
        'This source payment already has a bank transaction.',
      );
    throw error;
  }

  private async auditEvent(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
    entityType: string,
    entityId: string,
    action: string,
    value: object,
  ) {
    await this.audit.log(
      {
        actorUserId: user.id,
        entityType,
        entityId,
        action,
        newValues: JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue,
        requestMetadata: metadata,
      },
      tx,
    );
  }
}
