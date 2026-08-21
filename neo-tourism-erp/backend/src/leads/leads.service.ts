import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import type { Lead, Prisma } from '../../generated/prisma/client';
import { LeadActivityType, LeadStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { LeadQueryDto } from './dto/lead-query.dto';
import type { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import type { UpdateLeadDto } from './dto/update-lead.dto';

const customerSummarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  customerType: true,
} satisfies Prisma.CustomerSelect;

const agentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

const leadListInclude = {
  customer: { select: customerSummarySelect },
  assignedUser: { select: agentSelect },
} satisfies Prisma.LeadInclude;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateLeadDto, actorId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({
        where: { id: dto.customerId },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Customer not found.');

      const lead = await transaction.lead.create({
        data: {
          customerId: dto.customerId,
          source: dto.source?.trim(),
          destination: dto.destination?.trim(),
          travelDate: this.parseDate(dto.travelDate),
          summary: dto.summary?.trim(),
          createdById: actorId,
        },
        include: leadListInclude,
      });

      await transaction.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: actorId,
          type: LeadActivityType.LEAD_CREATED,
          description: 'Lead created.',
        },
      });
      await this.auditService.create(
        {
          actorId,
          entityType: 'Lead',
          entityId: lead.id,
          action: 'LEAD_CREATED',
          newValues: this.leadSnapshot(lead),
        },
        transaction,
      );
      return lead;
    });
  }

  findLive(query: LeadQueryDto) {
    return this.findPage(
      { status: LeadStatus.NEW, assignedUserId: null },
      query,
      [{ createdAt: 'asc' }, { id: 'asc' }],
    );
  }

  findMine(query: LeadQueryDto, actorId: string) {
    return this.findPage(
      { assignedUserId: actorId, ...this.buildFilters(query, false) },
      query,
    );
  }

  findAll(query: LeadQueryDto) {
    return this.findPage(this.buildFilters(query, true), query);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        customer: { select: customerSummarySelect },
        assignedUser: { select: agentSelect },
        createdBy: { select: agentSelect },
        activities: {
          include: { user: { select: agentSelect } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found.');
    this.assertCanAccess(lead, user);
    return lead;
  }

  async claim(id: string, actorId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const claimed = await transaction.lead.updateMany({
        where: {
          id,
          status: LeadStatus.NEW,
          assignedUserId: null,
        },
        data: {
          assignedUserId: actorId,
          assignedAt: now,
          status: LeadStatus.HANDLING,
          lastMeaningfulActivityAt: now,
        },
      });

      if (claimed.count !== 1) {
        const exists = await transaction.lead.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!exists) throw new NotFoundException('Lead not found.');
        throw new ConflictException('Lead has already been assigned.');
      }

      const lead = await transaction.lead.findUniqueOrThrow({
        where: { id },
        include: leadListInclude,
      });
      await transaction.leadActivity.create({
        data: {
          leadId: id,
          userId: actorId,
          type: LeadActivityType.LEAD_ASSIGNED,
          description: 'Lead claimed and assigned.',
          metadata: { oldAssignedUserId: null, newAssignedUserId: actorId },
        },
      });
      await this.auditService.create(
        {
          actorId,
          entityType: 'Lead',
          entityId: id,
          action: 'LEAD_CLAIMED',
          oldValues: { assignedUserId: null, status: LeadStatus.NEW },
          newValues: {
            assignedUserId: actorId,
            assignedAt: now.toISOString(),
            status: LeadStatus.HANDLING,
          },
        },
        transaction,
      );
      return lead;
    });
  }

  async update(id: string, dto: UpdateLeadDto, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.lead.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Lead not found.');
      this.assertCanAccess(existing, user);

      const lead = await transaction.lead.update({
        where: { id },
        data: {
          ...(dto.destination !== undefined && {
            destination: dto.destination.trim(),
          }),
          ...(dto.travelDate !== undefined && {
            travelDate: this.parseDate(dto.travelDate),
          }),
          ...(dto.summary !== undefined && { summary: dto.summary.trim() }),
          ...(dto.salesNotes !== undefined && {
            salesNotes: dto.salesNotes.trim(),
          }),
          ...(dto.nextActionAt !== undefined && {
            nextActionAt: new Date(dto.nextActionAt),
          }),
        },
        include: leadListInclude,
      });
      await transaction.leadActivity.create({
        data: {
          leadId: id,
          userId: user.id,
          type: LeadActivityType.LEAD_UPDATED,
          description: 'Lead details updated.',
        },
      });
      await this.auditService.create(
        {
          actorId: user.id,
          entityType: 'Lead',
          entityId: id,
          action: 'LEAD_UPDATED',
          oldValues: this.leadSnapshot(existing),
          newValues: this.leadSnapshot(lead),
        },
        transaction,
      );
      return lead;
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateLeadStatusDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.lead.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Lead not found.');
      this.assertCanAccess(existing, user);

      const now = new Date();
      const lead = await transaction.lead.update({
        where: { id },
        data: { status: dto.status, lastMeaningfulActivityAt: now },
        include: leadListInclude,
      });
      await transaction.leadActivity.create({
        data: {
          leadId: id,
          userId: user.id,
          type: LeadActivityType.STATUS_CHANGED,
          description: `Status changed from ${existing.status} to ${dto.status}.`,
          metadata: { oldStatus: existing.status, newStatus: dto.status },
        },
      });
      await this.auditService.create(
        {
          actorId: user.id,
          entityType: 'Lead',
          entityId: id,
          action: 'LEAD_STATUS_CHANGED',
          oldValues: { status: existing.status },
          newValues: { status: dto.status },
        },
        transaction,
      );
      return lead;
    });
  }

  async createNote(
    id: string,
    dto: CreateLeadNoteDto,
    user: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.lead.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Lead not found.');
      this.assertCanAccess(existing, user);

      const content = dto.content.trim();
      const activity = await transaction.leadActivity.create({
        data: {
          leadId: id,
          userId: user.id,
          type: LeadActivityType.NOTE_ADDED,
          description: content,
          metadata: { content },
        },
        include: { user: { select: agentSelect } },
      });
      await transaction.lead.update({
        where: { id },
        data: { lastMeaningfulActivityAt: activity.createdAt },
      });
      await this.auditService.create(
        {
          actorId: user.id,
          entityType: 'Lead',
          entityId: id,
          action: 'LEAD_NOTE_ADDED',
          newValues: { activityId: activity.id, content },
        },
        transaction,
      );
      return activity;
    });
  }

  private async findPage(
    where: Prisma.LeadWhereInput,
    query: LeadQueryDto,
    orderBy: Prisma.LeadOrderByWithRelationInput[] = [
      { updatedAt: 'desc' },
      { id: 'asc' },
    ],
  ) {
    const skip = (query.page - 1) * query.limit;
    const total = await this.prisma.lead.count({ where });
    const leads = await this.prisma.lead.findMany({
      where,
      include: leadListInclude,
      orderBy,
      skip,
      take: query.limit,
    });
    return {
      data: leads,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private buildFilters(
    query: LeadQueryDto,
    includeAssignee: boolean,
  ): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {};
    if (query.status) where.status = query.status;
    if (includeAssignee && query.assignedUserId) {
      where.assignedUserId = query.assignedUserId;
    }
    if (query.source) {
      where.source = { contains: query.source.trim(), mode: 'insensitive' };
    }
    if (query.destination) {
      where.destination = {
        contains: query.destination.trim(),
        mode: 'insensitive',
      };
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom && {
          gte: new Date(`${query.createdFrom}T00:00:00.000Z`),
        }),
        ...(query.createdTo && {
          lte: new Date(`${query.createdTo}T23:59:59.999Z`),
        }),
      };
    }
    const terms = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (terms.length) {
      where.AND = terms.map((term) => ({
        OR: [
          { destination: { contains: term, mode: 'insensitive' } },
          { summary: { contains: term, mode: 'insensitive' } },
          { customer: { firstName: { contains: term, mode: 'insensitive' } } },
          { customer: { lastName: { contains: term, mode: 'insensitive' } } },
          { customer: { email: { contains: term, mode: 'insensitive' } } },
          { customer: { phone: { contains: term, mode: 'insensitive' } } },
        ],
      }));
    }
    return where;
  }

  private assertCanAccess(
    lead: Pick<Lead, 'assignedUserId' | 'status'>,
    user: AuthenticatedUser,
  ) {
    if (user.permissions.includes('lead.view_all')) return;
    if (lead.assignedUserId === user.id) return;
    if (lead.assignedUserId === null && lead.status === LeadStatus.NEW) return;
    throw new ForbiddenException('You cannot access this lead.');
  }

  private parseDate(value?: string): Date | undefined {
    return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
  }

  private leadSnapshot(
    lead: Pick<
      Lead,
      | 'id'
      | 'customerId'
      | 'assignedUserId'
      | 'assignedAt'
      | 'status'
      | 'source'
      | 'destination'
      | 'travelDate'
      | 'summary'
      | 'salesNotes'
      | 'nextActionAt'
      | 'lastMeaningfulActivityAt'
    >,
  ): Prisma.InputJsonObject {
    return {
      id: lead.id,
      customerId: lead.customerId,
      assignedUserId: lead.assignedUserId,
      assignedAt: lead.assignedAt?.toISOString() ?? null,
      status: lead.status,
      source: lead.source,
      destination: lead.destination,
      travelDate: lead.travelDate?.toISOString() ?? null,
      summary: lead.summary,
      salesNotes: lead.salesNotes,
      nextActionAt: lead.nextActionAt?.toISOString() ?? null,
      lastMeaningfulActivityAt:
        lead.lastMeaningfulActivityAt?.toISOString() ?? null,
    };
  }
}
