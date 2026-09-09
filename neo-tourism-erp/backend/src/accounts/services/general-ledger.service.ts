import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../generated/prisma/client';
import type {
  AccountingMappingType,
  JournalSourceType,
} from '../../../generated/prisma/enums';
import type { AuthenticatedUser } from '../../auth/auth.types';
import type { RequestMetadata } from '../../common/request-metadata';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateGlAccountDto,
  CreateManualJournalDto,
  JournalQueryDto,
  LedgerQueryDto,
  TrialBalanceQueryDto,
  UpdateGlAccountDto,
  UpdateManualJournalDto,
} from '../dto/general-ledger.dto';
import { AccountingControlsService } from './accounting-controls.service';

type Client = Prisma.TransactionClient | PrismaService;

type PostingLine = {
  mapping?: AccountingMappingType;
  accountId?: string;
  bankAccountId?: string;
  debit?: Prisma.Decimal | string;
  credit?: Prisma.Decimal | string;
  description?: string;
  bookingId?: string;
  customerId?: string;
  supplierId?: string;
};

type AutomaticPosting = {
  sourceType: Exclude<JournalSourceType, 'MANUAL' | 'REVERSAL'>;
  sourceRecordId: string;
  date: Date;
  description: string;
  currency: string;
  bookingId?: string;
  lines: PostingLine[];
};

const journalInclude = {
  lines: { include: { account: true } },
  booking: { select: { id: true, folderNumber: true, customerId: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  postedBy: { select: { id: true, firstName: true, lastName: true } },
  reversal: { select: { id: true, journalNumber: true } },
  reversalOf: { select: { id: true, journalNumber: true } },
} satisfies Prisma.JournalEntryInclude;

@Injectable()
export class GeneralLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly controls: AccountingControlsService,
  ) {}

  listAccounts(activeOnly = false) {
    return this.prisma.glAccount.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: { parent: { select: { id: true, code: true, name: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createAccount(
    dto: CreateGlAccountDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertParent(dto.parentId, dto.type);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const value = await tx.glAccount.create({
          data: {
            code: dto.code.trim(),
            name: dto.name.trim(),
            type: dto.type,
            parentId: dto.parentId,
            description: dto.description,
            createdById: user.id,
            updatedById: user.id,
          },
        });
        await this.auditEvent(
          tx,
          user,
          metadata,
          'GlAccount',
          value.id,
          'GL_ACCOUNT_CREATED',
          value,
        );
        return value;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('GL account code already exists.');
      throw error;
    }
  }

  async updateAccount(
    id: string,
    dto: UpdateGlAccountDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const old = await this.prisma.glAccount.findUnique({ where: { id } });
    if (!old) throw new NotFoundException('GL account not found.');
    if (dto.parentId === id)
      throw new BadRequestException('An account cannot be its own parent.');
    await this.assertParent(dto.parentId, dto.type ?? old.type);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const value = await tx.glAccount.update({
          where: { id },
          data: {
            ...dto,
            ...(dto.code && { code: dto.code.trim() }),
            ...(dto.name && { name: dto.name.trim() }),
            updatedById: user.id,
          },
        });
        await this.audit.log(
          {
            actorUserId: user.id,
            entityType: 'GlAccount',
            entityId: id,
            action:
              dto.isActive === false
                ? 'GL_ACCOUNT_DEACTIVATED'
                : 'GL_ACCOUNT_UPDATED',
            oldValues: this.json(old),
            newValues: this.json(value),
            requestMetadata: metadata,
          },
          tx,
        );
        return value;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('GL account code already exists.');
      throw error;
    }
  }

  listMappings() {
    return this.prisma.accountingMapping.findMany({
      include: { account: true },
      orderBy: { type: 'asc' },
    });
  }

  async updateMapping(
    type: AccountingMappingType,
    accountId: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.assertActiveAccounts(this.prisma, [accountId]);
    return this.prisma.$transaction(async (tx) => {
      const old = await tx.accountingMapping.findUnique({ where: { type } });
      const value = await tx.accountingMapping.upsert({
        where: { type },
        update: { accountId, updatedById: user.id },
        create: { type, accountId, updatedById: user.id },
      });
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'AccountingMapping',
          entityId: accountId,
          action: 'ACCOUNTING_MAPPING_CHANGED',
          oldValues: this.json(old),
          newValues: this.json(value),
          requestMetadata: metadata,
        },
        tx,
      );
      return value;
    });
  }

  listJournals(query: JournalQueryDto) {
    return this.prisma.journalEntry.findMany({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.bookingId && { bookingId: query.bookingId }),
        ...(query.dateFrom || query.dateTo
          ? {
              journalDate: {
                ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
                ...(query.dateTo && { lte: new Date(query.dateTo) }),
              },
            }
          : {}),
      },
      include: journalInclude,
      orderBy: [{ journalDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async getJournal(id: string) {
    const journal = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: journalInclude,
    });
    if (!journal) throw new NotFoundException('Journal entry not found.');
    return journal;
  }

  async createManual(
    dto: CreateManualJournalDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const lines = this.dtoLines(dto.lines);
    this.assertBalanced(lines);
    await this.assertActiveAccounts(
      this.prisma,
      lines.map((line) => line.accountId),
    );
    return this.prisma.$transaction(async (tx) => {
      const valuation = await this.controls.valuation(
        tx,
        '1',
        dto.currency,
        new Date(dto.journalDate),
      );
      const value = await tx.journalEntry.create({
        data: {
          journalNumber: this.journalNumber(),
          journalDate: new Date(dto.journalDate),
          description: dto.description,
          sourceType: 'MANUAL',
          bookingId: dto.bookingId,
          currency: dto.currency.toUpperCase(),
          exchangeRate: valuation.exchangeRate,
          baseCurrency: valuation.baseCurrency,
          createdById: user.id,
          lines: { create: this.baseLines(lines, valuation.exchangeRate) },
        },
        include: journalInclude,
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'JournalEntry',
        value.id,
        'MANUAL_JOURNAL_CREATED',
        value,
      );
      return value;
    });
  }

  async updateManual(
    id: string,
    dto: UpdateManualJournalDto,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const old = await this.getJournal(id);
    if (old.sourceType !== 'MANUAL' || old.status !== 'DRAFT')
      throw new ConflictException('Only draft manual journals can be edited.');
    const lines = this.dtoLines(dto.lines);
    this.assertBalanced(lines);
    await this.assertActiveAccounts(
      this.prisma,
      lines.map((line) => line.accountId),
    );
    return this.prisma.$transaction(async (tx) => {
      const valuation = await this.controls.valuation(
        tx,
        '1',
        dto.currency,
        new Date(dto.journalDate),
      );
      await tx.journalLine.deleteMany({ where: { journalEntryId: id } });
      const value = await tx.journalEntry.update({
        where: { id },
        data: {
          journalDate: new Date(dto.journalDate),
          description: dto.description,
          currency: dto.currency.toUpperCase(),
          exchangeRate: valuation.exchangeRate,
          baseCurrency: valuation.baseCurrency,
          bookingId: dto.bookingId,
          lines: { create: this.baseLines(lines, valuation.exchangeRate) },
        },
        include: journalInclude,
      });
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'JournalEntry',
          entityId: id,
          action: 'MANUAL_JOURNAL_UPDATED',
          oldValues: this.json(old),
          newValues: this.json(value),
          requestMetadata: metadata,
        },
        tx,
      );
      return value;
    });
  }

  async approve(
    id: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const journal = await this.lockedJournal(tx, id);
      if (journal.status !== 'DRAFT')
        throw new ConflictException('Only draft journals can be approved.');
      if (journal.createdById === user.id)
        throw new ConflictException('The journal creator cannot approve it.');
      this.assertBalanced(journal.lines);
      await this.assertActiveAccounts(
        tx,
        journal.lines.map((line) => line.accountId),
      );
      const value = await tx.journalEntry.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: user.id,
          approvedAt: new Date(),
        },
        include: journalInclude,
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'JournalEntry',
        id,
        'JOURNAL_APPROVED',
        value,
      );
      return value;
    });
  }

  async reject(
    id: string,
    reason: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const journal = await this.lockedJournal(tx, id);
      if (journal.status !== 'DRAFT')
        throw new ConflictException('Only draft journals can be rejected.');
      const value = await tx.journalEntry.update({
        where: { id },
        data: { status: 'REJECTED' },
        include: journalInclude,
      });
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'JournalEntry',
          entityId: id,
          action: 'JOURNAL_REJECTED',
          metadata: { reason },
          requestMetadata: metadata,
        },
        tx,
      );
      return value;
    });
  }

  async post(id: string, user: AuthenticatedUser, metadata: RequestMetadata) {
    return this.prisma.$transaction(async (tx) => {
      const journal = await this.lockedJournal(tx, id);
      if (journal.status !== 'APPROVED')
        throw new ConflictException('Only approved journals can be posted.');
      await this.controls.assertOpenPeriod(tx, journal.journalDate);
      this.assertBalanced(journal.lines);
      await this.assertActiveAccounts(
        tx,
        journal.lines.map((line) => line.accountId),
      );
      const value = await tx.journalEntry.update({
        where: { id },
        data: { status: 'POSTED', postedById: user.id, postedAt: new Date() },
        include: journalInclude,
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'JournalEntry',
        id,
        'JOURNAL_POSTED',
        value,
      );
      return value;
    });
  }

  async reverse(
    id: string,
    reason: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
    client?: Prisma.TransactionClient,
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      const original = await this.lockedJournal(tx, id);
      if (original.status !== 'POSTED')
        throw new ConflictException('Only a posted journal can be reversed.');
      if (original.reversal)
        throw new ConflictException('Journal is already reversed.');
      const reversalDate = new Date();
      await this.controls.assertOpenPeriod(tx, reversalDate);
      const reversal = await tx.journalEntry.create({
        data: {
          journalNumber: this.journalNumber(),
          journalDate: reversalDate,
          description: `Reversal of ${original.journalNumber}: ${reason}`,
          sourceType: 'REVERSAL',
          sourceRecordId: original.id,
          bookingId: original.bookingId,
          currency: original.currency,
          exchangeRate: original.exchangeRate,
          baseCurrency: original.baseCurrency,
          status: 'POSTED',
          createdById: user.id,
          approvedById: user.id,
          approvedAt: new Date(),
          postedById: user.id,
          postedAt: new Date(),
          reversalOfId: original.id,
          lines: {
            create: original.lines.map((line) => ({
              accountId: line.accountId,
              debit: line.credit,
              credit: line.debit,
              baseDebit: line.baseCredit,
              baseCredit: line.baseDebit,
              description: line.description,
              bookingId: line.bookingId,
              customerId: line.customerId,
              supplierId: line.supplierId,
              companyBankAccountId: line.companyBankAccountId,
            })),
          },
        },
        include: journalInclude,
      });
      await tx.journalEntry.update({
        where: { id },
        data: {
          status: 'REVERSED',
          reversedById: user.id,
          reversedAt: new Date(),
          reversalReason: reason,
        },
      });
      await this.auditEvent(
        tx,
        user,
        metadata,
        'JournalEntry',
        id,
        'JOURNAL_REVERSED',
        reversal,
      );
      return reversal;
    };
    return client ? run(client) : this.prisma.$transaction(run);
  }

  async postAutomatic(
    tx: Prisma.TransactionClient,
    input: AutomaticPosting,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    await this.controls.assertOpenPeriod(tx, input.date);
    const existing = await tx.journalEntry.findUnique({
      where: {
        sourceType_sourceRecordId: {
          sourceType: input.sourceType,
          sourceRecordId: input.sourceRecordId,
        },
      },
      include: journalInclude,
    });
    if (existing) return existing;
    const lines = await Promise.all(
      input.lines.map(async (line) => ({
        ...line,
        accountId: await this.resolveAccount(tx, line),
        debit: new Prisma.Decimal(line.debit ?? 0),
        credit: new Prisma.Decimal(line.credit ?? 0),
        companyBankAccountId: line.bankAccountId,
        bankAccountId: undefined,
        mapping: undefined,
      })),
    );
    this.assertBalanced(lines);
    const valuation = await this.controls.valuation(
      tx,
      '1',
      input.currency,
      input.date,
    );
    const value = await tx.journalEntry.create({
      data: {
        journalNumber: this.journalNumber(),
        journalDate: input.date,
        description: input.description,
        sourceType: input.sourceType,
        sourceRecordId: input.sourceRecordId,
        bookingId: input.bookingId,
        currency: input.currency.toUpperCase(),
        exchangeRate: valuation.exchangeRate,
        baseCurrency: valuation.baseCurrency,
        status: 'POSTED',
        createdById: user.id,
        approvedById: user.id,
        approvedAt: new Date(),
        postedById: user.id,
        postedAt: new Date(),
        lines: { create: this.baseLines(lines, valuation.exchangeRate) },
      },
      include: journalInclude,
    });
    await this.auditEvent(
      tx,
      user,
      metadata,
      'JournalEntry',
      value.id,
      'AUTOMATIC_JOURNAL_GENERATED',
      value,
    );
    return value;
  }

  async reverseSource(
    tx: Prisma.TransactionClient,
    sourceType: JournalSourceType,
    sourceRecordId: string,
    reason: string,
    user: AuthenticatedUser,
    metadata: RequestMetadata,
  ) {
    const journal = await tx.journalEntry.findUnique({
      where: { sourceType_sourceRecordId: { sourceType, sourceRecordId } },
    });
    return journal
      ? this.reverse(journal.id, reason, user, metadata, tx)
      : null;
  }

  async assertSourceEditable(
    client: Client,
    sourceType: JournalSourceType,
    sourceRecordId: string,
  ) {
    const journal = await client.journalEntry.findUnique({
      where: { sourceType_sourceRecordId: { sourceType, sourceRecordId } },
      select: { id: true },
    });
    if (journal)
      throw new ConflictException(
        'This transaction has posted accounting history; reverse it instead of editing it.',
      );
  }

  async ledger(query: LedgerQueryDto) {
    const rows = await this.prisma.journalLine.findMany({
      where: {
        ...(query.accountId && { accountId: query.accountId }),
        ...(query.journalId && { journalEntryId: query.journalId }),
        ...(query.bookingId && { bookingId: query.bookingId }),
        ...(query.customerId && { customerId: query.customerId }),
        ...(query.supplierId && { supplierId: query.supplierId }),
        ...(query.companyBankAccountId && {
          companyBankAccountId: query.companyBankAccountId,
        }),
        journalEntry: {
          status: { in: ['POSTED', 'REVERSED'] },
          ...(query.dateFrom || query.dateTo
            ? {
                journalDate: {
                  ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
                  ...(query.dateTo && { lte: new Date(query.dateTo) }),
                },
              }
            : {}),
        },
      },
      include: { account: true, journalEntry: true },
      orderBy: [
        { journalEntry: { journalDate: 'asc' } },
        { journalEntry: { journalNumber: 'asc' } },
        { createdAt: 'asc' },
      ],
      take: 2000,
    });
    let runningBalance = new Prisma.Decimal(0);
    let baseRunningBalance = new Prisma.Decimal(0);
    return rows.map((row) => {
      runningBalance = runningBalance.plus(row.debit).minus(row.credit);
      baseRunningBalance = baseRunningBalance
        .plus(row.baseDebit)
        .minus(row.baseCredit);
      return {
        id: row.id,
        date: row.journalEntry.journalDate,
        journalId: row.journalEntryId,
        journalNumber: row.journalEntry.journalNumber,
        description: row.description ?? row.journalEntry.description,
        account: row.account,
        debit: row.debit,
        credit: row.credit,
        runningBalance,
        baseDebit: row.baseDebit,
        baseCredit: row.baseCredit,
        baseRunningBalance,
        baseCurrency: row.journalEntry.baseCurrency,
        sourceType: row.journalEntry.sourceType,
        sourceRecordId: row.journalEntry.sourceRecordId,
        bookingId: row.bookingId,
        customerId: row.customerId,
        supplierId: row.supplierId,
        companyBankAccountId: row.companyBankAccountId,
      };
    });
  }

  async trialBalance(query: TrialBalanceQueryDto) {
    const rows = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          status: { in: ['POSTED', 'REVERSED'] },
          ...(query.dateFrom || query.dateTo
            ? {
                journalDate: {
                  ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
                  ...(query.dateTo && { lte: new Date(query.dateTo) }),
                },
              }
            : {}),
        },
      },
      _sum: { baseDebit: true, baseCredit: true },
    });
    const accounts = await this.prisma.glAccount.findMany({
      where: { id: { in: rows.map((row) => row.accountId) } },
    });
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const data = rows
      .map((row) => {
        const debit = row._sum.baseDebit ?? new Prisma.Decimal(0);
        const credit = row._sum.baseCredit ?? new Prisma.Decimal(0);
        return {
          ...byId.get(row.accountId),
          totalDebit: debit,
          totalCredit: credit,
          closingBalance: debit.minus(credit),
        };
      })
      .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
    const totalDebit = data.reduce(
      (sum, row) => sum.plus(row.totalDebit),
      new Prisma.Decimal(0),
    );
    const totalCredit = data.reduce(
      (sum, row) => sum.plus(row.totalCredit),
      new Prisma.Decimal(0),
    );
    return {
      baseCurrency: (await this.controls.settings()).baseCurrency,
      data,
      totalDebit,
      totalCredit,
      difference: totalDebit.minus(totalCredit),
    };
  }

  private async lockedJournal(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "JournalEntry" WHERE "id" = ${id}::uuid FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Journal entry not found.');
    return tx.journalEntry.findUniqueOrThrow({
      where: { id },
      include: journalInclude,
    });
  }

  private async resolveAccount(
    tx: Prisma.TransactionClient,
    line: PostingLine,
  ) {
    if (line.accountId) {
      await this.assertActiveAccounts(tx, [line.accountId]);
      return line.accountId;
    }
    if (line.bankAccountId) {
      const bank = await tx.companyBankAccount.findUnique({
        where: { id: line.bankAccountId },
        include: { glAccount: true },
      });
      if (!bank?.isActive || !bank.glAccount?.isActive)
        throw new ConflictException(
          'Bank account has no active GL account mapping.',
        );
      return bank.glAccount.id;
    }
    if (!line.mapping)
      throw new BadRequestException('Journal line has no account mapping.');
    const mapping = await tx.accountingMapping.findUnique({
      where: { type: line.mapping },
      include: { account: true },
    });
    if (!mapping?.account.isActive)
      throw new ConflictException(
        `No active ${line.mapping} account mapping exists.`,
      );
    return mapping.accountId;
  }

  private async assertActiveAccounts(client: Client, ids: string[]) {
    const unique = [...new Set(ids)];
    const count = await client.glAccount.count({
      where: { id: { in: unique }, isActive: true },
    });
    if (count !== unique.length)
      throw new BadRequestException(
        'Every journal account must exist and be active.',
      );
  }

  private async assertParent(parentId: string | undefined, type: string) {
    if (!parentId) return;
    const parent = await this.prisma.glAccount.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.type !== type)
      throw new BadRequestException(
        'Parent account must exist and have the same type.',
      );
  }

  private dtoLines(lines: CreateManualJournalDto['lines']) {
    return lines.map((line) => ({
      ...line,
      debit: new Prisma.Decimal(line.debit),
      credit: new Prisma.Decimal(line.credit),
    }));
  }

  private baseLines<
    T extends { debit: Prisma.Decimal; credit: Prisma.Decimal },
  >(lines: T[], rate: Prisma.Decimal) {
    const valued = lines.map((line) => ({
      ...line,
      baseDebit: line.debit.mul(rate).toDecimalPlaces(2),
      baseCredit: line.credit.mul(rate).toDecimalPlaces(2),
    }));
    const difference = valued.reduce(
      (total, line) => total.plus(line.baseDebit).minus(line.baseCredit),
      new Prisma.Decimal(0),
    );
    if (difference.isZero()) return valued;
    const index = valued.findLastIndex((line) =>
      difference.isPositive()
        ? line.baseCredit.greaterThan(0)
        : line.baseDebit.greaterThan(0),
    );
    if (difference.isPositive())
      valued[index].baseCredit = valued[index].baseCredit.plus(difference);
    else valued[index].baseDebit = valued[index].baseDebit.minus(difference);
    return valued;
  }

  private assertBalanced(
    lines: { debit: Prisma.Decimal; credit: Prisma.Decimal }[],
  ) {
    if (lines.length < 2)
      throw new BadRequestException('A journal requires at least two lines.');
    for (const line of lines) {
      if (
        line.debit.isNegative() ||
        line.credit.isNegative() ||
        line.debit.isZero() === line.credit.isZero()
      )
        throw new BadRequestException(
          'Each line must contain one positive debit or credit.',
        );
    }
    const debit = lines.reduce(
      (sum, line) => sum.plus(line.debit),
      new Prisma.Decimal(0),
    );
    const credit = lines.reduce(
      (sum, line) => sum.plus(line.credit),
      new Prisma.Decimal(0),
    );
    if (!debit.equals(credit))
      throw new BadRequestException('Journal debits and credits must balance.');
  }

  private journalNumber() {
    return `JE-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
        newValues: this.json(value),
        requestMetadata: metadata,
      },
      tx,
    );
  }
}
