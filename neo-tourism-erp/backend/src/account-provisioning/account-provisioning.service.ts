import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import type { RequestMetadata } from '../common/request-metadata';
import { PositionAccessService } from '../positions/position-access.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  InvitationDelivery,
  InvitationMailerService,
} from './invitation-mailer.service';

const PASSWORD_SALT_ROUNDS = 12;
const ELIGIBLE_STATUSES = new Set(['ACTIVE', 'PROBATION']);

type Client = Prisma.TransactionClient;
type PendingInvitation = {
  id: string;
  userId: string;
  expiresAt: Date;
  invitationLink: string;
};

@Injectable()
export class AccountProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly positions: PositionAccessService,
    private readonly mailer: InvitationMailerService,
  ) {}

  async provisionEmployee(
    employeeId: string,
    actorId: string,
    meta: RequestMetadata | undefined,
    tx: Client,
  ) {
    const employee = await tx.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    if (employee.userId)
      throw new ConflictException('This employee already has an ERP account.');
    this.assertEligible(employee);
    const email = employee.workEmail?.trim().toLowerCase();
    if (!email)
      throw new BadRequestException(
        'A unique work email is required when ERP access is requested.',
      );
    const duplicateEmployee = await tx.employee.findFirst({
      where: {
        id: { not: employee.id },
        workEmail: { equals: email, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicateEmployee)
      throw new ConflictException(
        'This work email is already assigned to another employee.',
      );

    const user = await tx.user.create({
      data: {
        email,
        firstName: employee.firstName,
        lastName: employee.lastName,
        departmentId: employee.departmentId,
        isActive: false,
        // An unknown random hash keeps the existing non-null column compatible.
        // The employee replaces it through the single-use invitation.
        passwordHash: await bcrypt.hash(
          randomBytes(48).toString('base64url'),
          PASSWORD_SALT_ROUNDS,
        ),
      },
    });
    await tx.employee.update({
      where: { id: employee.id },
      data: { userId: user.id, erpAccountDisabled: false, workEmail: email },
    });
    await this.audit.log(
      {
        actorUserId: actorId,
        entityType: 'User',
        entityId: user.id,
        action: 'ERP_ACCOUNT_PROVISIONED',
        newValues: { employeeId: employee.id, email, isActive: false },
        requestMetadata: meta,
      },
      tx,
    );
    await this.audit.log(
      {
        actorUserId: actorId,
        entityType: 'User',
        entityId: user.id,
        action: 'USER_EMPLOYEE_LINKED',
        newValues: { employeeId: employee.id },
        requestMetadata: meta,
      },
      tx,
    );

    const roleSync = await this.positions.syncPositionRoles(
      employee.id,
      actorId,
      meta,
      tx,
    );
    const invitation = await this.createInvitation(user.id, actorId, meta, tx);
    const roles = await tx.userRole.findMany({
      where: { userId: user.id },
      include: { role: { select: { name: true } } },
      orderBy: { role: { name: 'asc' } },
    });
    const approvalRoles = roleSync.approvalPending.length
      ? await tx.role.findMany({
          where: { id: { in: roleSync.approvalPending } },
          select: { name: true },
          orderBy: { name: 'asc' },
        })
      : [];

    return {
      userId: user.id,
      loginEmail: email,
      state: 'PENDING_ACTIVATION' as const,
      roles: roles.map(({ role }) => role.name),
      approvalPending: approvalRoles.map(({ name }) => name),
      invitation,
    };
  }

  async resendInvitation(
    userId: string,
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const pending = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          employee: true,
          _count: { select: { accountInvitations: true } },
        },
      });
      if (!user) throw new NotFoundException('User not found.');
      if (user.isActive)
        throw new ConflictException('Only pending accounts can be invited.');
      if (!user.employee || !user._count.accountInvitations)
        throw new ConflictException('This is not a pending employee account.');
      this.assertEligible(user.employee);
      if (user.employee.erpAccountDisabled)
        throw new ConflictException(
          'ERP access is disabled for this employee.',
        );
      // Abuse guard: at most one invitation per minute per account. The
      // global HTTP throttler is too coarse for this sensitive endpoint.
      const latest = await tx.accountInvitation.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (latest && Date.now() - latest.createdAt.getTime() < 60_000)
        throw new ThrottlerException(
          'An invitation was just sent. Please wait a minute before retrying.',
        );
      const invitation = await this.createInvitation(
        user.id,
        actorId,
        meta,
        tx,
      );
      await this.audit.log(
        {
          actorUserId: actorId,
          entityType: 'AccountInvitation',
          entityId: invitation.id,
          action: 'ACCOUNT_INVITATION_REGENERATED',
          newValues: { userId: user.id, expiresAt: invitation.expiresAt },
          requestMetadata: meta,
        },
        tx,
      );
      return {
        invitation,
        recipient: {
          email: user.email,
          firstName: user.firstName,
          employeeNumber: user.employee.employeeNumber,
        },
      };
    });
    return this.deliverInvitation(
      pending.invitation,
      pending.recipient,
      actorId,
      meta,
    );
  }

  async deliverInvitation(
    invitation: PendingInvitation,
    recipient: { email: string; firstName: string; employeeNumber: string },
    actorId: string,
    meta?: RequestMetadata,
  ) {
    const delivery = await this.mailer.send({
      to: recipient.email,
      firstName: recipient.firstName,
      employeeNumber: recipient.employeeNumber,
      loginEmail: recipient.email,
      invitationLink: invitation.invitationLink,
      expiresAt: invitation.expiresAt,
    });
    await this.audit.log({
      actorUserId: actorId,
      entityType: 'AccountInvitation',
      entityId: invitation.id,
      action: deliveryAction(delivery),
      newValues: {
        userId: invitation.userId,
        recipient: recipient.email,
        delivery,
        expiresAt: invitation.expiresAt,
      },
      requestMetadata: meta,
    });
    // The raw link leaves this service only for delivery or explicit
    // development debugging — never in normal API responses.
    if (delivery === 'SENT' || !invitationLinkVisibleInDev())
      return { id: invitation.id, expiresAt: invitation.expiresAt, delivery };
    return { ...invitation, delivery };
  }

  async invalidateOpenInvitations(userId: string, tx: Client): Promise<number> {
    const result = await tx.accountInvitation.updateMany({
      where: { userId, usedAt: null, invalidatedAt: null },
      data: { invalidatedAt: new Date() },
    });
    return result.count;
  }

  private async createInvitation(
    userId: string,
    actorId: string,
    meta: RequestMetadata | undefined,
    tx: Client,
  ) {
    await this.invalidateOpenInvitations(userId, tx);
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + invitationTtlHours() * 3_600_000);
    const invitation = await tx.accountInvitation.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        expiresAt,
        createdById: actorId,
      },
    });
    await this.audit.log(
      {
        actorUserId: actorId,
        entityType: 'AccountInvitation',
        entityId: invitation.id,
        action: 'ACCOUNT_INVITATION_CREATED',
        newValues: { userId, expiresAt },
        requestMetadata: meta,
      },
      tx,
    );
    return {
      id: invitation.id,
      userId,
      expiresAt,
      invitationLink: `${frontendUrl()}/setup-password?token=${encodeURIComponent(rawToken)}`,
    };
  }

  private assertEligible(employee: {
    employmentStatus: string;
    archivedAt: Date | null;
  }) {
    if (
      employee.archivedAt ||
      !ELIGIBLE_STATUSES.has(employee.employmentStatus)
    )
      throw new ConflictException(
        'Only active or probation employees can activate ERP access.',
      );
  }
}

function deliveryAction(delivery: InvitationDelivery) {
  return `ACCOUNT_INVITATION_DELIVERY_${delivery}`;
}

function hashToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function invitationTtlHours() {
  const configured = Number(
    process.env.ACCOUNT_INVITE_EXPIRY_HOURS ??
      process.env.ACCOUNT_INVITATION_TTL_HOURS ??
      24,
  );
  return Number.isFinite(configured) && configured >= 1 && configured <= 168
    ? configured
    : 24;
}

function frontendUrl() {
  return (
    process.env.APP_FRONTEND_URL ??
    process.env.FRONTEND_URL ??
    'http://localhost:3000'
  )
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');
}

export function invitationLinkVisibleInDev(): boolean {
  return (
    process.env.SHOW_INVITATION_LINK_IN_DEV === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}
