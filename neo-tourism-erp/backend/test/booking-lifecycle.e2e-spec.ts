import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { BookingLifecycleService } from '../src/bookings/services/booking-lifecycle.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Booking travel lifecycle and folder closing (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let lifecycle: BookingLifecycleService;
  let managerToken: string;
  let normalToken: string;
  let customerId: string;
  const suffix = Date.now();
  const password = 'LifecyclePassword123!';
  const bookingIds: string[] = [];
  const leadIds: string[] = [];
  const saleIds: string[] = [];
  const userIds: string[] = [];
  const roleIds: string[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    lifecycle = app.get(BookingLifecycleService);
    const managerCodes = [
      'booking.view',
      'booking.view_all',
      'booking.edit',
      'booking.lifecycle.view',
      'booking.lifecycle.manage',
      'booking.operations.complete',
      'booking.closed.edit',
      'booking.reopen',
      'finance.view',
      'finance.reconcile',
      'customer.view',
    ];
    const normalCodes = [
      'booking.view',
      'booking.view_all',
      'booking.edit',
      'booking.lifecycle.view',
      'booking.operations.complete',
    ];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...new Set([...managerCodes, ...normalCodes])] } },
    });
    const makeRole = (name: string, codes: string[]) =>
      prisma.role.create({
        data: {
          name,
          permissions: {
            create: permissions
              .filter((p) => codes.includes(p.code))
              .map((p) => ({ permissionId: p.id })),
          },
        },
      });
    const [managerRole, normalRole] = await Promise.all([
      makeRole(`LIFECYCLE_MANAGER_${suffix}`, managerCodes),
      makeRole(`LIFECYCLE_NORMAL_${suffix}`, normalCodes),
    ]);
    roleIds.push(managerRole.id, normalRole.id);
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'Administration / Operations' },
    });
    const hash = await bcrypt.hash(password, 4);
    const [manager, normal] = await Promise.all([
      prisma.user.create({
        data: {
          email: `lifecycle-manager-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'Lifecycle',
          lastName: 'Manager',
          departmentId: department.id,
          roles: { create: { roleId: managerRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          email: `lifecycle-normal-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'Lifecycle',
          lastName: 'Normal',
          departmentId: department.id,
          roles: { create: { roleId: normalRole.id } },
        },
      }),
    ]);
    userIds.push(manager.id, normal.id);
    const customer = await prisma.customer.create({
      data: {
        firstName: 'Repeat',
        lastName: 'Passenger',
        customerType: 'NEW',
        createdById: manager.id,
        updatedById: manager.id,
      },
    });
    customerId = customer.id;
    const createBooking = async (index: number, start: string, end: string) => {
      const lead = await prisma.lead.create({
        data: {
          customerId,
          assignedUserId: manager.id,
          status: 'SALE_MADE',
          destination: `Lifecycle ${index}`,
          createdById: manager.id,
        },
      });
      leadIds.push(lead.id);
      const sale = await prisma.saleSubmission.create({
        data: {
          leadId: lead.id,
          customerId,
          submittedByUserId: manager.id,
          destination: `Lifecycle ${index}`,
          travelStartDate: new Date(start),
          travelEndDate: new Date(end),
          sellingPrice: '1000.00',
          currency: 'GBP',
          status: 'ADMIN_ACCEPTED',
        },
      });
      saleIds.push(sale.id);
      const booking = await prisma.booking.create({
        data: {
          folderNumber: `NT-2098-${String(suffix + index).slice(-6)}`,
          customerId,
          leadId: lead.id,
          saleSubmissionId: sale.id,
          salesAdvisorId: manager.id,
          operationsOwnerId: normal.id,
          destination: `Lifecycle ${index}`,
          travelStartDate: new Date(start),
          travelEndDate: new Date(end),
          finalServiceDate: new Date(end),
          sellingPrice: '1000.00',
          currency: 'GBP',
          createdById: manager.id,
        },
      });
      bookingIds.push(booking.id);
      return booking.id;
    };
    await createBooking(1, '2026-08-01', '2026-08-10');
    await createBooking(2, '2026-09-01', '2026-09-10');
    await createBooking(3, '2026-09-01', '2026-09-10');
    await createBooking(4, '2026-08-01', '2026-08-10');
    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      return (response.body as { accessToken: string }).accessToken;
    };
    [managerToken, normalToken] = await Promise.all([
      login(manager.email),
      login(normal.email),
    ]);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: {
        OR: [{ entityId: { in: bookingIds } }, { userId: { in: userIds } }],
      },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.reconciliation.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.bookingFinance.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.saleSubmission.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await app.close();
  });

  it('travel complete alone does not close the folder and notifications are deduplicated', async () => {
    await lifecycle.evaluateBookingLifecycle(bookingIds[0], {
      now: new Date('2026-08-22'),
    });
    await lifecycle.evaluateBookingLifecycle(bookingIds[0], {
      now: new Date('2026-08-22'),
    });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingIds[0] },
    });
    expect(booking.travelStatus).toBe('TRAVEL_COMPLETE');
    expect(booking.folderStatus).toBe('OPEN');
    await expect(
      prisma.notification.count({
        where: { entityId: bookingIds[0], type: 'TRAVEL_COMPLETE' },
      }),
    ).resolves.toBe(2);
  });

  it('Operations complete alone and Accounts reconciled alone do not close folders', async () => {
    await request(app.getHttpServer())
      .post(`/bookings/${bookingIds[1]}/operations/complete`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    await prisma.booking.update({
      where: { id: bookingIds[2] },
      data: { accountsStatus: 'RECONCILED' },
    });
    await lifecycle.evaluateBookingLifecycle(bookingIds[2], {
      now: new Date('2026-08-22'),
    });
    const values = await prisma.booking.findMany({
      where: { id: { in: [bookingIds[1], bookingIds[2]] } },
      select: { folderStatus: true },
    });
    expect(values.every((x) => x.folderStatus === 'OPEN')).toBe(true);
  });

  it('all three complete closes folder and marks a repeat passenger', async () => {
    await request(app.getHttpServer())
      .post(`/bookings/${bookingIds[0]}/operations/complete`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    await prisma.booking.update({
      where: { id: bookingIds[0] },
      data: { accountsStatus: 'RECONCILED' },
    });
    await request(app.getHttpServer())
      .post(`/bookings/${bookingIds[0]}/lifecycle/re-evaluate`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201)
      .expect((r) =>
        expect((r.body as { folderStatus: string }).folderStatus).toBe(
          'CLOSED',
        ),
      );
    await expect(
      prisma.customer
        .findUniqueOrThrow({ where: { id: customerId } })
        .then((c) => c.customerType),
    ).resolves.toBe('REPEAT');
  });

  it('blocks normal closed-folder edits and allows exceptional authorized edits', async () => {
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingIds[0]}`)
      .set('Authorization', `Bearer ${normalToken}`)
      .send({ destination: 'Blocked' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingIds[0]}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ destination: 'Authorized correction' })
      .expect(200);
  });

  it('reopen requires permission and a reason, then date correction re-evaluates travel', async () => {
    await request(app.getHttpServer())
      .post(`/bookings/${bookingIds[0]}/reopen`)
      .set('Authorization', `Bearer ${normalToken}`)
      .send({ reason: 'No permission' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/bookings/${bookingIds[0]}/reopen`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(`/bookings/${bookingIds[0]}/reopen`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Travel date correction required.' })
      .expect(201);
    const futureYear = new Date().getUTCFullYear() + 2;
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingIds[0]}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        travelStartDate: `${futureYear}-09-01`,
        travelEndDate: `${futureYear}-09-10`,
        finalServiceDate: `${futureYear}-09-10`,
      })
      .expect(200)
      .expect((r) =>
        expect((r.body as { travelStatus: string }).travelStatus).toBe(
          'UPCOMING',
        ),
      );
    await lifecycle.evaluateAllActiveBookings(new Date());
    await expect(
      prisma.booking
        .findUniqueOrThrow({ where: { id: bookingIds[0] } })
        .then((b) => b.folderStatus),
    ).resolves.toBe('OPEN');
  });

  it('reconciliation completion immediately evaluates and closes an eligible folder', async () => {
    await lifecycle.evaluateBookingLifecycle(bookingIds[3], {
      now: new Date('2026-08-22'),
    });
    await request(app.getHttpServer())
      .post(`/bookings/${bookingIds[3]}/operations/complete`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    await prisma.reconciliation.create({
      data: {
        bookingId: bookingIds[3],
        status: 'IN_REVIEW',
        passengerPaymentsVerified: true,
        supplierCostsVerified: true,
        supplierPaymentsVerified: true,
        sellingPriceVerified: true,
        feesVerified: true,
        adjustmentsVerified: true,
        profitVerified: true,
      },
    });
    await request(app.getHttpServer())
      .post(`/bookings/${bookingIds[3]}/reconciliation/complete`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    await expect(
      prisma.booking
        .findUniqueOrThrow({ where: { id: bookingIds[3] } })
        .then((b) => b.folderStatus),
    ).resolves.toBe('CLOSED');
  });

  it('Customer 360 returns real booking history and repeat metrics', async () => {
    const response = await request(app.getHttpServer())
      .get(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    const body = response.body as {
      bookings: Array<{ id: string }>;
      summary: {
        totalBookings: number;
        completedTrips: number;
        repeatPassenger: boolean;
      };
    };
    expect(body.bookings).toHaveLength(4);
    expect(body.summary.totalBookings).toBe(4);
    expect(body.summary.completedTrips).toBeGreaterThanOrEqual(1);
    expect(body.summary.repeatPassenger).toBe(true);
  });

  it('records lifecycle audit events', async () => {
    const actions = (
      await prisma.auditLog.findMany({
        where: { entityId: { in: bookingIds } },
        select: { action: true },
      })
    ).map((x) => x.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'TRAVEL_STATUS_CHANGED',
        'OPERATIONS_COMPLETED',
        'FOLDER_CLOSED',
        'FOLDER_REOPENED',
        'BOOKING_LIFECYCLE_REEVALUATED',
      ]),
    );
  });
});
