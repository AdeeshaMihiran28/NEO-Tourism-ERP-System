import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Customer, Prisma } from '../../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import type { CreateCustomerDto } from './dto/create-customer.dto';
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

  async findAll(query: CustomerQueryDto) {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;
    const total = await this.prisma.customer.count({ where });
    const customers = await this.prisma.customer.findMany({
      where,
      select: customerListSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip,
      take: query.limit,
    });

    return {
      data: customers,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        updatedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        notes: {
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        _count: { select: { leads: true } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const { _count, ...details } = customer;
    return {
      ...details,
      summary: {
        totalLeads: _count.leads,
        totalBookings: 0,
      },
    };
  }

  async create(dto: CreateCustomerDto, actorId: string) {
    const email = dto.email?.trim().toLowerCase();
    const phone = dto.phone?.trim();
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
          secondaryPhone: dto.secondaryPhone?.trim(),
          dateOfBirth: this.parseDate(dto.dateOfBirth),
          nationality: dto.nationality?.trim(),
          customerType: dto.customerType,
          createdById: actorId,
          updatedById: actorId,
        },
        select: customerListSelect,
      });

      await this.auditService.create(
        {
          actorId,
          entityType: 'Customer',
          entityId: customer.id,
          action: 'CUSTOMER_CREATED',
          newValues: this.customerSnapshot(customer),
        },
        transaction,
      );

      return customer;
    });
  }

  async update(id: string, dto: UpdateCustomerDto, actorId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const existingCustomer = await transaction.customer.findUnique({
        where: { id },
      });

      if (!existingCustomer) {
        throw new NotFoundException('Customer not found.');
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
            email: dto.email.trim().toLowerCase(),
          }),
          ...(dto.phone !== undefined && { phone: dto.phone.trim() }),
          ...(dto.secondaryPhone !== undefined && {
            secondaryPhone: dto.secondaryPhone.trim(),
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
          updatedById: actorId,
        },
        select: customerListSelect,
      });

      const statusChanged =
        dto.isActive !== undefined &&
        dto.isActive !== existingCustomer.isActive;
      const action = statusChanged
        ? dto.isActive
          ? 'CUSTOMER_ACTIVATED'
          : 'CUSTOMER_DEACTIVATED'
        : 'CUSTOMER_UPDATED';

      await this.auditService.create(
        {
          actorId,
          entityType: 'Customer',
          entityId: id,
          action,
          oldValues: this.customerSnapshot(existingCustomer),
          newValues: this.customerSnapshot(customer),
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

      await this.auditService.create(
        {
          actorId,
          entityType: 'Customer',
          entityId: customerId,
          action: 'CUSTOMER_NOTE_CREATED',
          newValues: { noteId: note.id, content: note.content },
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
