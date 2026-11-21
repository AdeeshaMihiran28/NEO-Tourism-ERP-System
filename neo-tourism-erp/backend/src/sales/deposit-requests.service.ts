import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import {
  BookingPaymentType,
  DepositRequestStatus,
  NotificationType,
  SaleSubmissionStatus,
} from '../../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { isUniqueConstraintError } from '../common/prisma-errors';
import type { RequestMetadata } from '../common/request-metadata';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateDepositRequestDto,
  DecideDepositRequestDto,
} from './dto/deposit-request.dto';

const personSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

const depositInclude = {
  customer: {
    select: { id: true, firstName: true, lastName: true },
  },
  requestedBy: { select: personSelect },
  decidedBy: { select: personSelect },
  saleSubmission: {
    select: {
      id: true,
      status: true,
      salesNotes: true,
      paymentArrangementNotes: true,
      products: {
        select: {
          id: true,
          description: true,
          attachments: {
            select: {
              id: true,
              fileName: true,
              fileType: true,
              fileSize: true,
            },
          },
        },
      },
      paymentEntries: {
        select: {
          id: true,
          evidence: {
            select: {
              id: true,
              fileName: true,
              fileType: true,
              fileSize: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.DepositRequestInclude;

@Injectable()
export class DepositRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    saleSubmissionId: string,
    dto: CreateDepositRequestDto,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const submission = await transaction.saleSubmission.findUnique({
          where: { id: saleSubmissionId },
          select: {
            id: true,
            leadId: true,
            customerId: true,
            submittedByUserId: true,
            destination: true,
            travelStartDate: true,
            travelEndDate: true,
            estimatedCostOfSale: true,
            sellingPrice: true,
            initialPaymentAmount: true,
            finalBalancePaymentDate: true,
            paymentArrangementNotes: true,
            currency: true,
            paymentType: true,
            status: true,
            depositRequest: { select: { id: true } },
            customer: { select: { firstName: true, lastName: true } },
          },
        });
        if (!submission)
          throw new NotFoundException('Sale Submission not found.');
        if (submission.submittedByUserId !== user.id)
          throw new ForbiddenException(
            "You cannot request approval for another user's Payment Card.",
          );
        if (submission.depositRequest)
          throw new ConflictException(
            'A Deposit Request already exists for this Payment Card.',
          );
        if (
          submission.status !== SaleSubmissionStatus.DRAFT &&
          submission.status !== SaleSubmissionStatus.SUBMITTED_TO_ADMIN
        )
          throw new ConflictException(
            'Deposit approval can only be requested before Admin acceptance.',
          );
        if (
          submission.paymentType !== BookingPaymentType.DEPOSIT &&
          submission.paymentType !== BookingPaymentType.INTERNAL_DEPOSIT
        )
          throw new BadRequestException(
            'Payment type must be Deposit or Internal Deposit.',
          );
        if (submission.currency?.toUpperCase() !== 'GBP')
          throw new BadRequestException(
            'Deposit Requests currently support GBP Payment Cards only.',
          );
        const missing = [
          !submission.destination && 'destination',
          !submission.travelStartDate && 'departure date',
          !submission.estimatedCostOfSale && 'net fare',
          !submission.sellingPrice && 'selling fare',
          submission.initialPaymentAmount === null && 'initial payment',
          !submission.finalBalancePaymentDate && 'balance payment date',
        ].filter(Boolean);
        if (missing.length)
          throw new BadRequestException(
            `Payment Card is missing: ${missing.join(', ')}.`,
          );

        const request = await transaction.depositRequest.create({
          data: {
            saleSubmissionId,
            customerId: submission.customerId,
            leadId: submission.leadId,
            requestedByUserId: user.id,
            destination: submission.destination!,
            departureDate: submission.travelStartDate!,
            arrivalDate: submission.travelEndDate,
            passengerCount: dto.passengerCount,
            cancellationCost: dto.cancellationCost,
            netFare: submission.estimatedCostOfSale!,
            sellingFare: submission.sellingPrice!,
            initialPaymentAmount: submission.initialPaymentAmount!,
            balancePaymentDate: submission.finalBalancePaymentDate!,
            arrangementNotes:
              dto.arrangementNotes?.trim() ||
              submission.paymentArrangementNotes ||
              null,
          },
          include: depositInclude,
        });
        await this.audit.log(
          {
            actorUserId: user.id,
            entityType: 'DepositRequest',
            entityId: request.id,
            action: 'DEPOSIT_REQUEST_SUBMITTED',
            newValues: this.snapshot(request),
            metadata: { saleSubmissionId, leadId: submission.leadId },
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
                    some: { permission: { code: 'deposit.approval.view' } },
                  },
                },
              },
            },
          },
          select: { id: true },
        });
        for (const recipient of recipients) {
          await this.notifications.create(
            {
              userId: recipient.id,
              type: NotificationType.GENERAL,
              title: 'Deposit approval required',
              message: `${user.firstName} ${user.lastName} submitted a deposit request for ${submission.customer.firstName} ${submission.customer.lastName}.`,
              entityType: 'DepositApproval',
              entityId: request.id,
            },
            transaction,
          );
        }
        return request;
      });
    } catch (error) {
      if (isUniqueConstraintError(error))
        throw new ConflictException(
          'A Deposit Request already exists for this Payment Card.',
        );
      throw error;
    }
  }

  listMine(userId: string) {
    return this.prisma.depositRequest.findMany({
      where: { requestedByUserId: userId },
      include: depositInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  listPending() {
    return this.prisma.depositRequest.findMany({
      where: { status: DepositRequestStatus.PENDING_APPROVAL },
      include: depositInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async findBySubmission(saleSubmissionId: string, user: AuthenticatedUser) {
    const request = await this.prisma.depositRequest.findUnique({
      where: { saleSubmissionId },
      include: depositInclude,
    });
    if (!request) return null;
    if (
      request.requestedByUserId !== user.id &&
      !user.permissions.includes('deposit.approval.view')
    )
      throw new ForbiddenException('You cannot view this Deposit Request.');
    return request;
  }

  async decide(
    id: string,
    dto: DecideDepositRequestDto,
    user: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    if (dto.decision === 'REJECTED' && !dto.notes?.trim())
      throw new BadRequestException('A rejection reason is required.');
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.depositRequest.findUnique({
        where: { id },
        include: depositInclude,
      });
      if (!current) throw new NotFoundException('Deposit Request not found.');
      if (current.status !== DepositRequestStatus.PENDING_APPROVAL)
        throw new ConflictException(
          'This Deposit Request has already been decided.',
        );
      const now = new Date();
      const status =
        dto.decision === 'APPROVED'
          ? DepositRequestStatus.APPROVED
          : DepositRequestStatus.REJECTED;
      const changed = await transaction.depositRequest.updateMany({
        where: { id, status: DepositRequestStatus.PENDING_APPROVAL },
        data: {
          status,
          decidedByUserId: user.id,
          decidedAt: now,
          decisionNotes: dto.notes?.trim() || null,
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'This Deposit Request has already been decided.',
        );
      await this.audit.log(
        {
          actorUserId: user.id,
          entityType: 'DepositRequest',
          entityId: id,
          action:
            status === DepositRequestStatus.APPROVED
              ? 'DEPOSIT_REQUEST_APPROVED'
              : 'DEPOSIT_REQUEST_REJECTED',
          oldValues: { status: current.status },
          newValues: {
            status,
            decidedByUserId: user.id,
            decidedAt: now.toISOString(),
            decisionNotes: dto.notes?.trim() || null,
          },
          metadata: { saleSubmissionId: current.saleSubmissionId },
          requestMetadata,
        },
        transaction,
      );
      await this.notifications.create(
        {
          userId: current.requestedByUserId,
          type: NotificationType.GENERAL,
          title: `Deposit request ${status === DepositRequestStatus.APPROVED ? 'approved' : 'rejected'}`,
          message:
            dto.notes?.trim() ||
            `Your deposit request for ${current.destination} was ${status.toLowerCase()}.`,
          entityType: 'DepositRequest',
          entityId: id,
        },
        transaction,
      );
      return transaction.depositRequest.findUniqueOrThrow({
        where: { id },
        include: depositInclude,
      });
    });
  }

  private snapshot(request: {
    id: string;
    saleSubmissionId: string;
    customerId: string;
    leadId: string;
    requestedByUserId: string;
    passengerCount: number;
    cancellationCost: Prisma.Decimal;
    netFare: Prisma.Decimal;
    sellingFare: Prisma.Decimal;
    initialPaymentAmount: Prisma.Decimal;
    balancePaymentDate: Date;
    status: DepositRequestStatus;
  }): Prisma.InputJsonObject {
    return {
      id: request.id,
      saleSubmissionId: request.saleSubmissionId,
      customerId: request.customerId,
      leadId: request.leadId,
      requestedByUserId: request.requestedByUserId,
      passengerCount: request.passengerCount,
      cancellationCost: request.cancellationCost.toString(),
      netFare: request.netFare.toString(),
      sellingFare: request.sellingFare.toString(),
      initialPaymentAmount: request.initialPaymentAmount.toString(),
      balancePaymentDate: request.balancePaymentDate.toISOString(),
      status: request.status,
    };
  }
}
