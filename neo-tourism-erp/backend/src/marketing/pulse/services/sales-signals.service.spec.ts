import { ForbiddenException } from '@nestjs/common';
import {
  MarketingPriority,
  MarketingSalesSignalStatus,
  MarketingSalesSignalType,
} from '../../../../generated/prisma/client';
import type { AuditService } from '../../../audit/audit.service';
import type { AuthenticatedUser } from '../../../auth/auth.types';
import type { NotificationsService } from '../../../notifications/notifications.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../../../auth/decorators/permissions.decorator';
import { PulseController } from '../pulse.controller';
import { SalesSignalsService } from './sales-signals.service';

const advisor: AuthenticatedUser = {
  id: 'sales-1',
  email: 'sales@example.test',
  firstName: 'Sales',
  lastName: 'Advisor',
  isActive: true,
  department: 'Sales',
  roles: ['Sales'],
  permissions: ['marketing.sales_signal.create'],
};

describe('SalesSignalsService ownership', () => {
  it('keeps Marketing intake behind the department view permission', () => {
    const target = Object.getOwnPropertyDescriptor(
      PulseController.prototype,
      'listSignals',
    )?.value as object;
    const permissions = Reflect.getMetadata(PERMISSIONS_KEY, target) as
      string[] | undefined;

    expect(permissions).toEqual(['marketing.sales_signal.view']);
  });

  it('derives customer and destination from an owned Lead', async () => {
    const created: Array<Record<string, unknown>> = [];
    const create = jest.fn(({ data }: { data: Record<string, unknown> }) => {
      created.push(data);
      return Promise.resolve({
        id: 'signal-1',
        priority: MarketingPriority.NORMAL,
        status: MarketingSalesSignalStatus.NEW,
        ...data,
      });
    });
    const prisma = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({
          customerId: 'customer-1',
          destination: 'Dubai',
          assignedUserId: advisor.id,
        }),
      },
      marketingSalesSignal: { create },
    } as unknown as PrismaService;
    const service = new SalesSignalsService(
      prisma,
      { log: jest.fn() } as unknown as AuditService,
      {} as NotificationsService,
    );

    await service.create(
      {
        leadId: 'lead-1',
        signalType: MarketingSalesSignalType.DESTINATION_INTEREST,
        title: 'Dubai demand',
        description: 'Customers requested Dubai packages.',
      },
      advisor,
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(created[0]).toMatchObject({
      leadId: 'lead-1',
      customerId: 'customer-1',
      destination: 'Dubai',
      createdByUserId: advisor.id,
    });
  });

  it('rejects customer context from a Lead owned by another advisor', async () => {
    const create = jest.fn();
    const prisma = {
      lead: {
        findUnique: jest.fn().mockResolvedValue({
          customerId: 'customer-1',
          destination: 'Dubai',
          assignedUserId: 'another-advisor',
        }),
      },
      marketingSalesSignal: { create },
    } as unknown as PrismaService;
    const service = new SalesSignalsService(
      prisma,
      {} as AuditService,
      {} as NotificationsService,
    );

    await expect(
      service.create(
        {
          leadId: 'lead-1',
          signalType: MarketingSalesSignalType.CUSTOMER_QUESTION,
          title: 'Question',
          description: 'Private customer context',
        },
        advisor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
  });
});
