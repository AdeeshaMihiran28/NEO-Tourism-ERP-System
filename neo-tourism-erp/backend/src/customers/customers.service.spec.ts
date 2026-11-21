import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';

describe('CustomersService primary contact protection', () => {
  const customer = {
    id: 'customer-1',
    firstName: 'John',
    lastName: 'Employee',
    email: 'john@gmail.com',
    phone: '0112233445',
    secondaryPhone: null,
    dateOfBirth: null,
    nationality: null,
    customerType: 'NEW',
    isActive: true,
  };
  const actor: AuthenticatedUser = {
    id: 'sales-1',
    email: 'sales@example.com',
    firstName: 'Sales',
    lastName: 'User',
    isActive: true,
    department: 'Sales',
    roles: ['SALES'],
    permissions: ['customer.edit'],
  };

  function service() {
    let receivedUpdate: unknown;
    const transaction = {
      customer: {
        findUnique: jest.fn().mockResolvedValue(customer),
        update: jest.fn((query: unknown) => {
          receivedUpdate = query;
          return Promise.resolve(customer);
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
      ),
    } as unknown as PrismaService;
    const audit = { log: jest.fn() } as unknown as AuditService;
    return {
      customers: new CustomersService(prisma, audit),
      transaction,
      getUpdate: () => receivedUpdate,
    };
  }

  it('rejects a primary email change without the dedicated permission', async () => {
    const { customers, transaction } = service();

    await expect(
      customers.update(customer.id, { email: 'other@example.com' }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.customer.update).not.toHaveBeenCalled();
  });

  it('rejects changing or clearing the primary phone without permission', async () => {
    const { customers, transaction } = service();

    await expect(
      customers.update(customer.id, { phone: '' }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction.customer.update).not.toHaveBeenCalled();
  });

  it('allows an unchanged primary contact in a normal profile update', async () => {
    const { customers, transaction } = service();

    await customers.update(
      customer.id,
      { firstName: 'Johnny', email: customer.email, phone: customer.phone },
      actor,
    );

    expect(transaction.customer.update).toHaveBeenCalledTimes(1);
  });

  it('allows the dedicated permission to update primary contact details', async () => {
    const { customers, getUpdate } = service();

    await customers.update(
      customer.id,
      { email: 'new@example.com', phone: '+94 77 123 4567' },
      {
        ...actor,
        permissions: [...actor.permissions, 'customer.primary_contact.edit'],
      },
    );

    expect(getUpdate()).toMatchObject({
      data: { email: 'new@example.com', phone: '+94 77 123 4567' },
    });
  });

  it('allows secondary phone changes but rejects the primary number as secondary', async () => {
    const { customers, getUpdate } = service();

    await customers.update(
      customer.id,
      { secondaryPhone: '+94 76 555 1212' },
      actor,
    );
    expect(getUpdate()).toMatchObject({
      data: { secondaryPhone: '+94 76 555 1212' },
    });

    await expect(
      customers.update(customer.id, { secondaryPhone: '011-223-3445' }, actor),
    ).rejects.toThrow('Secondary phone must be different');
  });

  it('allows removing a secondary phone without changing the primary phone', async () => {
    const { customers, getUpdate } = service();

    await customers.update(customer.id, { secondaryPhone: null }, actor);

    expect(getUpdate()).toMatchObject({ data: { secondaryPhone: null } });
  });

  it('updates classification independently through the customer record', async () => {
    const { customers, getUpdate } = service();

    await customers.update(customer.id, { customerType: 'REFERRAL' }, actor);

    expect(getUpdate()).toMatchObject({ data: { customerType: 'REFERRAL' } });
  });

  it('scopes customer list history to the current user', async () => {
    let receivedQuery: unknown;
    const findMany = jest.fn((query: unknown) => {
      receivedQuery = query;
      return Promise.resolve([]);
    });
    const prisma = {
      customer: { count: jest.fn().mockResolvedValue(0), findMany },
    } as unknown as PrismaService;
    const customers = new CustomersService(prisma, {
      log: jest.fn(),
    } as unknown as AuditService);

    await customers.findAll(
      { page: 1, limit: 20 },
      {
        ...actor,
        permissions: ['customer.view', 'lead.view', 'booking.view'],
      },
    );

    expect(receivedQuery).toMatchObject({
      select: {
        _count: {
          select: {
            leads: {
              where: {
                OR: [
                  { assignedUserId: actor.id },
                  { assignedUserId: null, status: 'NEW' },
                ],
              },
            },
            bookings: {
              where: {
                OR: [
                  { salesAdvisorId: actor.id },
                  { operationsOwnerId: actor.id },
                ],
              },
            },
          },
        },
      },
    });
  });
});
