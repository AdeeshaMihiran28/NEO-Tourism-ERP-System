import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type SaleSubmission } from '../../generated/prisma/client';
import {
  LeadActivityType,
  LeadStatus,
  NotificationType,
  SaleSubmissionStatus,
} from '../../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { isUniqueConstraintError } from '../common/prisma-errors';
import type { RequestMetadata } from '../common/request-metadata';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SaleSubmissionQueryDto } from './dto/sale-submission-query.dto';
import type { UpdateSaleSubmissionDto } from './dto/update-sale-submission.dto';

const ACTIVE_SALE_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.HANDLING,
  LeadStatus.QUOTING,
  LeadStatus.FOLLOW_UP,
  LeadStatus.CALLBACK,
  LeadStatus.GOING_TO_BOOK,
];

const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

const customerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  secondaryPhone: true,
} satisfies Prisma.CustomerSelect;

const submissionInclude = {
  customer: { select: customerSelect },
  submittedBy: { select: personSelect },
  lead: {
    select: {
      id: true,
      status: true,
      destination: true,
      travelDate: true,
      summary: true,
      salesNotes: true,
      assignedUserId: true,
    },
  },
} satisfies Prisma.SaleSubmissionInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async startSaleMade(
    leadId: string,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const lead = await transaction.lead.findUnique({
          where: { id: leadId },
          include: {
            customer: { select: customerSelect },
            saleSubmission: { select: { id: true, status: true } },
          },
        });
        if (!lead) throw new NotFoundException('Lead not found.');
        this.assertCanManageLead(lead.assignedUserId, user);
        if (!ACTIVE_SALE_LEAD_STATUSES.includes(lead.status)) {
          throw new ConflictException(
            'Sale Made can only be started from an active sales stage.',
          );
        }
        if (lead.saleSubmission) {
          throw new ConflictException(
            'A Sale Submission already exists for this lead.',
          );
        }

        const submission = await transaction.saleSubmission.create({
          data: {
            leadId: lead.id,
            customerId: lead.customerId,
            submittedByUserId: user.id,
            destination: lead.destination,
            travelStartDate: lead.travelDate,
            salesNotes: lead.salesNotes,
          },
          include: submissionInclude,
        });
        await transaction.leadActivity.create({
          data: {
            leadId,
            userId: user.id,
            type: LeadActivityType.SALE_MADE_STARTED,
            description: 'Sale Made workflow started and Payment Card created.',
            metadata: { saleSubmissionId: submission.id },
          },
        });
        await this.auditService.log(
          {
            actorUserId: user.id,
            entityType: 'SaleSubmission',
            entityId: submission.id,
            action: 'SALE_MADE_STARTED',
            newValues: this.snapshot(submission),
            metadata: { leadId, customerId: lead.customerId },
            requestMetadata,
          },
          transaction,
        );
        return submission;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A Sale Submission already exists for this lead.',
        );
      }
      throw error;
    }
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const submission = await this.prisma.saleSubmission.findUnique({
      where: { id },
      include: submissionInclude,
    });
    if (!submission) throw new NotFoundException('Sale Submission not found.');
    this.assertCanView(submission.submittedByUserId, user);
    return submission;
  }

  async findMine(userId: string, query: SaleSubmissionQueryDto) {
    const where: Prisma.SaleSubmissionWhereInput = {
      submittedByUserId: userId,
      ...(query.status && { status: query.status }),
    };
    return this.findPage(where, query, [{ updatedAt: 'desc' }, { id: 'desc' }]);
  }

  findAdminQueue(query: SaleSubmissionQueryDto) {
    return this.findPage(
      { status: SaleSubmissionStatus.SUBMITTED_TO_ADMIN },
      query,
      [{ submittedAt: 'asc' }, { id: 'asc' }],
    );
  }

  async update(
    id: string,
    dto: UpdateSaleSubmissionDto,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    if (!Object.keys(dto).length) {
      throw new BadRequestException(
        'At least one Payment Card field is required.',
      );
    }
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.saleSubmission.findUnique({
        where: { id },
      });
      if (!existing) throw new NotFoundException('Sale Submission not found.');
      this.assertOwner(existing.submittedByUserId, user);
      if (existing.status !== SaleSubmissionStatus.DRAFT) {
        throw new ConflictException(
          'Only draft Sale Submissions can be edited.',
        );
      }

      const travelStartDate = dto.travelStartDate
        ? this.parseDate(dto.travelStartDate)
        : existing.travelStartDate;
      const travelEndDate = dto.travelEndDate
        ? this.parseDate(dto.travelEndDate)
        : existing.travelEndDate;
      this.assertTravelDates(travelStartDate, travelEndDate);
      const submission = await transaction.saleSubmission.update({
        where: { id },
        data: {
          ...(dto.destination !== undefined && {
            destination: dto.destination.trim(),
          }),
          ...(dto.travelStartDate !== undefined && { travelStartDate }),
          ...(dto.travelEndDate !== undefined && { travelEndDate }),
          ...(dto.sellingPrice !== undefined && {
            sellingPrice: dto.sellingPrice,
          }),
          ...(dto.depositAmount !== undefined && {
            depositAmount: dto.depositAmount,
          }),
          ...(dto.currency !== undefined && {
            currency: dto.currency.toUpperCase(),
          }),
          ...(dto.paymentMethod !== undefined && {
            paymentMethod: dto.paymentMethod,
          }),
          ...(dto.paymentReference !== undefined && {
            paymentReference: dto.paymentReference.trim() || null,
          }),
          ...(dto.salesNotes !== undefined && {
            salesNotes: dto.salesNotes.trim() || null,
          }),
        },
        include: submissionInclude,
      });
      this.assertDeposit(
        submission.sellingPrice?.toString(),
        submission.depositAmount?.toString(),
      );
      await transaction.leadActivity.create({
        data: {
          leadId: existing.leadId,
          userId: user.id,
          type: LeadActivityType.SALE_SUBMISSION_UPDATED,
          description: 'Sale Payment Card draft updated.',
          metadata: { saleSubmissionId: id },
        },
      });
      await this.auditService.log(
        {
          actorUserId: user.id,
          entityType: 'SaleSubmission',
          entityId: id,
          action: 'SALE_SUBMISSION_UPDATED',
          oldValues: this.snapshot(existing),
          newValues: this.snapshot(submission),
          metadata: { leadId: existing.leadId },
          requestMetadata,
        },
        transaction,
      );
      return submission;
    });
  }

  async submit(
    id: string,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.saleSubmission.findUnique({
        where: { id },
        include: submissionInclude,
      });
      if (!existing) throw new NotFoundException('Sale Submission not found.');
      this.assertOwner(existing.submittedByUserId, user);
      if (existing.status !== SaleSubmissionStatus.DRAFT) {
        throw new ConflictException(
          'Only draft Sale Submissions can be submitted.',
        );
      }
      this.assertComplete(existing);

      const now = new Date();
      const changed = await transaction.saleSubmission.updateMany({
        where: { id, status: SaleSubmissionStatus.DRAFT },
        data: {
          status: SaleSubmissionStatus.SUBMITTED_TO_ADMIN,
          submittedAt: now,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Sale Submission has already been submitted.',
        );
      await transaction.lead.update({
        where: { id: existing.leadId },
        data: {
          status: LeadStatus.SALE_MADE,
          lastMeaningfulActivityAt: now,
          isAttentionRequired: false,
          attentionReason: null,
          attentionSince: null,
        },
      });
      await transaction.leadActivity.create({
        data: {
          leadId: existing.leadId,
          userId: user.id,
          type: LeadActivityType.SALE_SUBMITTED_TO_ADMIN,
          description: 'Sale Payment Card submitted to Admin.',
          metadata: {
            saleSubmissionId: id,
            oldStatus: existing.status,
            newStatus: SaleSubmissionStatus.SUBMITTED_TO_ADMIN,
          },
        },
      });
      await this.auditService.log(
        {
          actorUserId: user.id,
          entityType: 'SaleSubmission',
          entityId: id,
          action: 'SALE_SUBMITTED_TO_ADMIN',
          oldValues: { status: existing.status, submittedAt: null },
          newValues: {
            status: SaleSubmissionStatus.SUBMITTED_TO_ADMIN,
            submittedAt: now.toISOString(),
          },
          metadata: {
            leadId: existing.leadId,
            customerId: existing.customerId,
          },
          requestMetadata,
        },
        transaction,
      );

      const recipients = await transaction.user.findMany({
        where: {
          isActive: true,
          roles: {
            some: {
              role: {
                permissions: {
                  some: { permission: { code: 'admin.sale_queue.view' } },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      const customerName = `${existing.customer.firstName} ${existing.customer.lastName}`;
      for (const recipient of recipients) {
        await this.notificationsService.create(
          {
            userId: recipient.id,
            type: NotificationType.NEW_SALE,
            title: 'New Sale / Payment Card',
            message: `A new sale for ${customerName} has been submitted by ${existing.submittedBy.firstName} ${existing.submittedBy.lastName}.`,
            entityType: 'SaleSubmission',
            entityId: id,
            metadata: { leadId: existing.leadId },
          },
          transaction,
        );
      }
      return transaction.saleSubmission.findUniqueOrThrow({
        where: { id },
        include: submissionInclude,
      });
    });
  }

  async accept(
    id: string,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.saleSubmission.findUnique({
        where: { id },
        include: submissionInclude,
      });
      if (!existing) throw new NotFoundException('Sale Submission not found.');
      if (existing.status !== SaleSubmissionStatus.SUBMITTED_TO_ADMIN) {
        throw new ConflictException('Only submitted sales can be accepted.');
      }
      const changed = await transaction.saleSubmission.updateMany({
        where: { id, status: SaleSubmissionStatus.SUBMITTED_TO_ADMIN },
        data: { status: SaleSubmissionStatus.ADMIN_ACCEPTED },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Sale Submission has already been reviewed.',
        );
      await transaction.leadActivity.create({
        data: {
          leadId: existing.leadId,
          userId: user.id,
          type: LeadActivityType.SALE_ACCEPTED_BY_ADMIN,
          description:
            'Sale accepted by Admin and ready for Folder / Booking Creation.',
          metadata: { saleSubmissionId: id },
        },
      });
      await this.auditService.log(
        {
          actorUserId: user.id,
          entityType: 'SaleSubmission',
          entityId: id,
          action: 'SALE_ACCEPTED_BY_ADMIN',
          oldValues: { status: existing.status },
          newValues: { status: SaleSubmissionStatus.ADMIN_ACCEPTED },
          metadata: {
            leadId: existing.leadId,
            customerId: existing.customerId,
          },
          requestMetadata,
        },
        transaction,
      );
      await this.notificationsService.create(
        {
          userId: existing.submittedByUserId,
          type: NotificationType.SALE_ACCEPTED,
          title: 'Sale Accepted',
          message: `Your sale for ${existing.customer.firstName} ${existing.customer.lastName} has been accepted by Admin.`,
          entityType: 'SaleSubmission',
          entityId: id,
          metadata: { leadId: existing.leadId },
        },
        transaction,
      );
      return transaction.saleSubmission.findUniqueOrThrow({
        where: { id },
        include: submissionInclude,
      });
    });
  }

  private async findPage(
    where: Prisma.SaleSubmissionWhereInput,
    query: SaleSubmissionQueryDto,
    orderBy: Prisma.SaleSubmissionOrderByWithRelationInput[],
  ) {
    const skip = (query.page - 1) * query.limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.saleSubmission.count({ where }),
      this.prisma.saleSubmission.findMany({
        where,
        include: submissionInclude,
        orderBy,
        skip,
        take: query.limit,
      }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private assertCanManageLead(
    assignedUserId: string | null,
    user: AuthenticatedUser,
  ) {
    if (
      assignedUserId === user.id ||
      user.permissions.includes('lead.view_all')
    )
      return;
    throw new ForbiddenException('You cannot start a sale for this lead.');
  }

  private assertOwner(ownerId: string, user: AuthenticatedUser) {
    if (ownerId === user.id) return;
    throw new ForbiddenException(
      "You cannot change another user's Sale Submission.",
    );
  }

  private assertCanView(ownerId: string, user: AuthenticatedUser) {
    if (ownerId === user.id && user.permissions.includes('sale.view_own'))
      return;
    if (
      user.permissions.includes('admin.sale_queue.view') ||
      user.permissions.includes('admin.sale.accept')
    )
      return;
    throw new ForbiddenException('You cannot view this Sale Submission.');
  }

  private assertComplete(submission: SaleSubmission) {
    const missing: string[] = [];
    if (!submission.customerId) missing.push('customer');
    if (!submission.leadId) missing.push('lead');
    if (!submission.destination?.trim()) missing.push('destination');
    if (!submission.travelStartDate) missing.push('travelStartDate');
    if (!submission.sellingPrice) missing.push('sellingPrice');
    if (!submission.currency?.trim()) missing.push('currency');
    if (!submission.paymentMethod) missing.push('paymentMethod');
    if (missing.length)
      throw new BadRequestException(
        `Payment Card is incomplete. Missing: ${missing.join(', ')}.`,
      );
    this.assertTravelDates(
      submission.travelStartDate,
      submission.travelEndDate,
    );
    this.assertDeposit(
      submission.sellingPrice?.toString(),
      submission.depositAmount?.toString(),
    );
  }

  private assertTravelDates(start: Date | null, end: Date | null) {
    if (start && end && end < start)
      throw new BadRequestException(
        'Travel end date cannot be before the start date.',
      );
  }

  private assertDeposit(sellingPrice?: string, depositAmount?: string) {
    if (
      sellingPrice &&
      depositAmount &&
      new Prisma.Decimal(depositAmount).greaterThan(sellingPrice)
    ) {
      throw new BadRequestException(
        'Deposit amount cannot exceed the selling price.',
      );
    }
  }

  private parseDate(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private snapshot(
    submission: Pick<
      SaleSubmission,
      | 'id'
      | 'leadId'
      | 'customerId'
      | 'submittedByUserId'
      | 'destination'
      | 'travelStartDate'
      | 'travelEndDate'
      | 'sellingPrice'
      | 'depositAmount'
      | 'currency'
      | 'paymentMethod'
      | 'status'
      | 'submittedAt'
    >,
  ): Prisma.InputJsonObject {
    return {
      id: submission.id,
      leadId: submission.leadId,
      customerId: submission.customerId,
      submittedByUserId: submission.submittedByUserId,
      destination: submission.destination,
      travelStartDate: submission.travelStartDate?.toISOString() ?? null,
      travelEndDate: submission.travelEndDate?.toISOString() ?? null,
      sellingPrice: submission.sellingPrice?.toString() ?? null,
      depositAmount: submission.depositAmount?.toString() ?? null,
      currency: submission.currency,
      paymentMethod: submission.paymentMethod,
      status: submission.status,
      submittedAt: submission.submittedAt?.toISOString() ?? null,
    };
  }
}
