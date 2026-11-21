import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Customer, Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { RequestMetadata } from '../common/request-metadata';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import type { CustomerHistoryQueryDto } from './dto/customer-history-query.dto';
import type { CustomerQueryDto } from './dto/customer-query.dto';
import type { UpdateCustomerDto } from './dto/update-customer.dto';

const customerListSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  secondaryPhone: true,
  dateOfBirth: true,
  nationality: true,
  customerType: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: CustomerQueryDto, user: AuthenticatedUser) {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;
    const leadWhere = this.leadScope(user);
    const bookingWhere = this.bookingScope(user);
    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        select: {
          ...customerListSelect,
          _count: {
            select: {
              leads: { where: leadWhere },
              bookings: { where: bookingWhere },
            },
          },
          leads: {
            where: leadWhere,
            select: { receivedAt: true, createdAt: true },
            orderBy: [
              { receivedAt: { sort: 'desc', nulls: 'last' } },
              { createdAt: 'desc' },
            ],
            take: 1,
          },
          bookings: {
            where: bookingWhere,
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: query.limit,
      }),
    ]);

    return {
      data: customers.map(({ _count, leads, bookings, ...customer }) => ({
        ...customer,
        totalInquiries: _count.leads,
        totalBookings: _count.bookings,
        lastInquiryAt: leads[0]?.receivedAt ?? leads[0]?.createdAt ?? null,
        lastBookingAt: bookings[0]?.createdAt ?? null,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(
    id: string,
    query: CustomerHistoryQueryDto,
    user: AuthenticatedUser,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        ...customerListSelect,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        updatedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const leadWhere = { customerId: id, ...this.leadScope(user) };
    const bookingWhere = { customerId: id, ...this.bookingScope(user) };
    const saleWhere: Prisma.SaleSubmissionWhereInput = {
      customerId: id,
      status: { in: ['SUBMITTED_TO_ADMIN', 'ADMIN_ACCEPTED'] },
      lead: this.leadScope(user),
    };
    const [
      totalLeads,
      leads,
      totalBookings,
      bookings,
      totalCompletedSales,
      latestLead,
      latestBooking,
      latestLeadActivity,
      latestBookingActivity,
      latestNote,
    ] = await Promise.all([
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.findMany({
        where: leadWhere,
        select: {
          id: true,
          receivedAt: true,
          createdAt: true,
          destination: true,
          travelDate: true,
          travelEndDate: true,
          source: true,
          status: true,
          lastMeaningfulActivityAt: true,
          updatedAt: true,
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: [
          { receivedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: (query.leadPage - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.booking.count({ where: bookingWhere }),
      this.prisma.booking.findMany({
        where: bookingWhere,
        select: {
          id: true,
          folderNumber: true,
          destination: true,
          travelStartDate: true,
          travelEndDate: true,
          createdAt: true,
          travelStatus: true,
          operationsStatus: true,
          folderStatus: true,
          salesAdvisor: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          references: {
            select: { id: true, type: true, reference: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.bookingPage - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.saleSubmission.count({ where: saleWhere }),
      this.prisma.lead.findFirst({
        where: leadWhere,
        select: { receivedAt: true, createdAt: true },
        orderBy: [
          { receivedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.booking.findFirst({
        where: bookingWhere,
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.lead.findFirst({
        where: leadWhere,
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.booking.findFirst({
        where: bookingWhere,
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.customerNote.findFirst({
        where: { customerId: id },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const lastActivityAt = [
      customer.updatedAt,
      latestLeadActivity?.updatedAt,
      latestBookingActivity?.updatedAt,
      latestNote?.createdAt,
    ].reduce<Date>(
      (latest, value) => (value && value > latest ? value : latest),
      customer.updatedAt,
    );

    return {
      ...customer,
      leads,
      bookings,
      leadPagination: this.pagination(query.leadPage, query.limit, totalLeads),
      bookingPagination: this.pagination(
        query.bookingPage,
        query.limit,
        totalBookings,
      ),
      summary: {
        totalLeads,
        totalCompletedSales,
        totalBookings,
        latestInquiryAt:
          latestLead?.receivedAt ?? latestLead?.createdAt ?? null,
        latestBookingAt: latestBooking?.createdAt ?? null,
        lastActivityAt,
      },
    };
  }

  async create(
    dto: CreateCustomerDto,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
    const email = dto.email?.trim().toLowerCase();
    const phone = dto.phone?.trim();
    const secondaryPhone = dto.secondaryPhone?.trim();
    this.assertDistinctPhones(phone, secondaryPhone);
    const possibleDuplicates = await this.findPossibleDuplicates(email, phone);

    if (possibleDuplicates.length && !dto.confirmDuplicate) {
      throw new ConflictException({
        code: 'POSSIBLE_DUPLICATE',
        message: 'Possible existing customer found.',
        possibleDuplicates,
      });
    }

    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.create({
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email,
          phone,
          secondaryPhone,
          dateOfBirth: this.parseDate(dto.dateOfBirth),
          nationality: dto.nationality?.trim(),
          customerType: dto.customerType,
          createdById: actorId,
          updatedById: actorId,
        },
        select: customerListSelect,
      });

      await this.auditService.log(
        {
          actorUserId: actorId,
          entityType: 'Customer',
          entityId: customer.id,
          action: 'CUSTOMER_CREATED',
          newValues: this.customerSnapshot(customer),
          requestMetadata,
        },
        transaction,
      );

      return customer;
    });
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    actor: AuthenticatedUser,
    requestMetadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existingCustomer = await transaction.customer.findUnique({
        where: { id },
      });

      if (!existingCustomer) {
        throw new NotFoundException('Customer not found.');
      }

      const email = dto.email?.trim().toLowerCase();
      const phone = dto.phone?.trim();
      const secondaryPhone =
        dto.secondaryPhone === null ? null : dto.secondaryPhone?.trim();
      const primaryContactChanged =
        (email !== undefined && email !== existingCustomer.email) ||
        (phone !== undefined && phone !== existingCustomer.phone);
      if (
        primaryContactChanged &&
        !actor.permissions.includes('customer.primary_contact.edit')
      ) {
        throw new ForbiddenException(
          'customer.primary_contact.edit is required to change primary email or phone.',
        );
      }
      if (phone !== undefined || dto.secondaryPhone !== undefined) {
        this.assertDistinctPhones(
          phone ?? existingCustomer.phone ?? undefined,
          dto.secondaryPhone !== undefined
            ? (secondaryPhone ?? undefined)
            : (existingCustomer.secondaryPhone ?? undefined),
        );
      }

      const customer = await transaction.customer.update({
        where: { id },
        data: {
          ...(dto.firstName !== undefined && {
            firstName: dto.firstName.trim(),
          }),
          ...(dto.lastName !== undefined && {
            lastName: dto.lastName.trim(),
          }),
          ...(dto.email !== undefined && {
            email,
          }),
          ...(dto.phone !== undefined && { phone }),
          ...(dto.secondaryPhone !== undefined && {
            secondaryPhone,
          }),
          ...(dto.dateOfBirth !== undefined && {
            dateOfBirth: this.parseDate(dto.dateOfBirth),
          }),
          ...(dto.nationality !== undefined && {
            nationality: dto.nationality.trim(),
          }),
          ...(dto.customerType !== undefined && {
            customerType: dto.customerType,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          updatedById: actor.id,
        },
        select: customerListSelect,
      });

      await this.auditService.log(
        {
          actorUserId: actor.id,
          entityType: 'Customer',
          entityId: id,
          action: 'CUSTOMER_UPDATED',
          oldValues: this.customerSnapshot(existingCustomer),
          newValues: this.customerSnapshot(customer),
          requestMetadata,
        },
        transaction,
      );

      return customer;
    });
  }

  async findNotes(customerId: string) {
    await this.ensureCustomerExists(customerId);

    return this.prisma.customerNote.findMany({
      where: { customerId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNote(
    customerId: string,
    dto: CreateCustomerNoteDto,
    actorId: string,
    requestMetadata?: RequestMetadata,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });

      if (!customer) {
        throw new NotFoundException('Customer not found.');
      }

      const note = await transaction.customerNote.create({
        data: {
          customerId,
          content: dto.content.trim(),
          createdById: actorId,
        },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      await this.auditService.log(
        {
          actorUserId: actorId,
          entityType: 'Customer',
          entityId: customerId,
          action: 'CUSTOMER_NOTE_ADDED',
          newValues: { noteId: note.id, content: note.content },
          requestMetadata,
        },
        transaction,
      );

      return note;
    });
  }

  private buildWhere(query: CustomerQueryDto): Prisma.CustomerWhereInput {
    const conditions: Prisma.CustomerWhereInput[] = [];

    if (query.customerType) {
      conditions.push({ customerType: query.customerType });
    }

    const terms = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
    for (const term of terms) {
      conditions.push({
        OR: [
          ...(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(term)
            ? [{ id: term }]
            : []),
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
          { secondaryPhone: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    return conditions.length ? { AND: conditions } : {};
  }

  private leadScope(user: AuthenticatedUser): Prisma.LeadWhereInput {
    if (!user.permissions.includes('lead.view')) return { id: { in: [] } };
    if (user.permissions.includes('lead.view_all')) return {};
    return {
      OR: [
        { assignedUserId: user.id },
        { assignedUserId: null, status: 'NEW' },
      ],
    };
  }

  private bookingScope(user: AuthenticatedUser): Prisma.BookingWhereInput {
    if (!user.permissions.includes('booking.view')) return { id: { in: [] } };
    if (user.permissions.includes('booking.view_all')) return {};
    return {
      OR: [{ salesAdvisorId: user.id }, { operationsOwnerId: user.id }],
    };
  }

  private pagination(page: number, limit: number, total: number) {
    return { page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  private assertDistinctPhones(primary?: string, secondary?: string) {
    const normalizedPrimary = primary?.replace(/\D/g, '');
    const normalizedSecondary = secondary?.replace(/\D/g, '');
    if (normalizedPrimary && normalizedPrimary === normalizedSecondary) {
      throw new ConflictException(
        'Secondary phone must be different from the primary phone.',
      );
    }
  }

  private findPossibleDuplicates(email?: string, phone?: string) {
    const conditions: Prisma.CustomerWhereInput[] = [];
    if (email) {
      conditions.push({ email: { equals: email, mode: 'insensitive' } });
    }
    if (phone) {
      conditions.push({ phone });
    }

    if (!conditions.length) {
      return Promise.resolve([]);
    }

    return this.prisma.customer.findMany({
      where: { OR: conditions },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        customerType: true,
        isActive: true,
      },
      take: 5,
    });
  }

  private async ensureCustomerExists(id: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
  }

  private parseDate(value?: string): Date | undefined {
    return value ? new Date(`${value}T00:00:00.000Z`) : undefined;
  }

  private customerSnapshot(
    customer: Pick<
      Customer,
      | 'id'
      | 'firstName'
      | 'lastName'
      | 'email'
      | 'phone'
      | 'secondaryPhone'
      | 'dateOfBirth'
      | 'nationality'
      | 'customerType'
      | 'isActive'
    >,
  ): Prisma.InputJsonObject {
    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      secondaryPhone: customer.secondaryPhone,
      dateOfBirth: customer.dateOfBirth?.toISOString() ?? null,
      nationality: customer.nationality,
      customerType: customer.customerType,
      isActive: customer.isActive,
    };
  }
}
