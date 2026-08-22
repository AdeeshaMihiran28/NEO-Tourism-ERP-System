import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginBody {
  accessToken: string;
}
interface BookingBody {
  id: string;
  folderNumber: string;
  destination: string;
  sellingPrice?: string;
  passengers?: Array<{ passportNumber: string | null }>;
  suppliers?: Array<{ supplierCost?: string }>;
}

describe('Booking operations foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let opsToken: string;
  let restrictedToken: string;
  let outsiderToken: string;
  let operationsOwnerId: string;
  let saleId: string;
  let unacceptedSaleId: string;
  let bookingId: string;
  const bookingIds: string[] = [];
  const saleIds: string[] = [];
  const leadIds: string[] = [];
  const customerIds: string[] = [];
  const userIds: string[] = [];
  const suffix = Date.now();
  const password = 'BookingTestPassword123!';
  const roleNames = [
    `BOOKING_OPS_${suffix}`,
    `BOOKING_RESTRICTED_${suffix}`,
    `BOOKING_OUTSIDER_${suffix}`,
  ];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    const opsCodes = [
      'booking.view',
      'booking.view_all',
      'booking.create',
      'booking.edit',
      'booking.assign_operations',
      'booking.manage_passengers',
      'booking.manage_suppliers',
      'booking.manage_references',
      'booking.manage_documents',
      'booking.manage_notes',
      'booking.manage_tasks',
      'booking.status.manage',
      'finance.view',
      'finance.edit',
    ];
    const restrictedCodes = ['booking.view', 'booking.view_all'];
    const outsiderCodes = ['booking.view', 'booking.edit'];
    const permissions = await prisma.permission.findMany({
      where: {
        code: {
          in: [...new Set([...opsCodes, ...restrictedCodes, ...outsiderCodes])],
        },
      },
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
    const [opsRole, restrictedRole, outsiderRole] = await Promise.all([
      makeRole(roleNames[0], opsCodes),
      makeRole(roleNames[1], restrictedCodes),
      makeRole(roleNames[2], outsiderCodes),
    ]);
    const [salesDepartment, operationsDepartment] = await Promise.all([
      prisma.department.findUniqueOrThrow({ where: { name: 'Sales' } }),
      prisma.department.findUniqueOrThrow({
        where: { name: 'Administration / Operations' },
      }),
    ]);
    const passwordHash = await bcrypt.hash(password, 4);
    const [sales, ops, restricted, outsider, operationsOwner] =
      await Promise.all([
        prisma.user.create({
          data: {
            email: `booking-sales-${suffix}@example.com`,
            passwordHash,
            firstName: 'Sales',
            lastName: 'Advisor',
            departmentId: salesDepartment.id,
          },
        }),
        prisma.user.create({
          data: {
            email: `booking-ops-${suffix}@example.com`,
            passwordHash,
            firstName: 'Admin',
            lastName: 'Operator',
            departmentId: operationsDepartment.id,
            roles: { create: { roleId: opsRole.id } },
          },
        }),
        prisma.user.create({
          data: {
            email: `booking-restricted-${suffix}@example.com`,
            passwordHash,
            firstName: 'Restricted',
            lastName: 'Viewer',
            departmentId: operationsDepartment.id,
            roles: { create: { roleId: restrictedRole.id } },
          },
        }),
        prisma.user.create({
          data: {
            email: `booking-outsider-${suffix}@example.com`,
            passwordHash,
            firstName: 'Outside',
            lastName: 'Editor',
            departmentId: operationsDepartment.id,
            roles: { create: { roleId: outsiderRole.id } },
          },
        }),
        prisma.user.create({
          data: {
            email: `booking-owner-${suffix}@example.com`,
            passwordHash,
            firstName: 'Naveen',
            lastName: 'Operations',
            departmentId: operationsDepartment.id,
          },
        }),
      ]);
    userIds.push(
      sales.id,
      ops.id,
      restricted.id,
      outsider.id,
      operationsOwner.id,
    );
    operationsOwnerId = operationsOwner.id;
    const login = async (email: string) =>
      (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password })
          .expect(200)
      ).body as LoginBody;
    [opsToken, restrictedToken, outsiderToken] = await Promise.all([
      login(ops.email),
      login(restricted.email),
      login(outsider.email),
    ]).then((items) => items.map((item) => item.accessToken));

    const createSale = async (
      status: 'ADMIN_ACCEPTED' | 'DRAFT',
      index: number,
    ) => {
      const customer = await prisma.customer.create({
        data: {
          firstName: `Booking${index}`,
          lastName: 'Passenger',
          email: `booking-customer-${index}-${suffix}@example.com`,
          createdById: sales.id,
          updatedById: sales.id,
        },
      });
      customerIds.push(customer.id);
      const lead = await prisma.lead.create({
        data: {
          customerId: customer.id,
          assignedUserId: sales.id,
          status: status === 'ADMIN_ACCEPTED' ? 'SALE_MADE' : 'GOING_TO_BOOK',
          destination: `Destination ${index}`,
          travelDate: new Date('2026-11-10T00:00:00.000Z'),
          createdById: sales.id,
        },
      });
      leadIds.push(lead.id);
      const sale = await prisma.saleSubmission.create({
        data: {
          leadId: lead.id,
          customerId: customer.id,
          submittedByUserId: sales.id,
          destination: `Destination ${index}`,
          travelStartDate: new Date('2026-11-10T00:00:00.000Z'),
          travelEndDate: new Date('2026-11-17T00:00:00.000Z'),
          sellingPrice: '3200.00',
          currency: 'GBP',
          paymentMethod: 'CARD',
          status,
        },
      });
      saleIds.push(sale.id);
      return sale.id;
    };
    saleId = await createSale('ADMIN_ACCEPTED', 1);
    unacceptedSaleId = await createSale('DRAFT', 2);
    await createSale('ADMIN_ACCEPTED', 3);
    await createSale('ADMIN_ACCEPTED', 4);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: {
        OR: [{ entityId: { in: bookingIds } }, { userId: { in: userIds } }],
      },
    });
    await prisma.auditLog.deleteMany({
      where: { entityType: 'Booking', entityId: { in: bookingIds } },
    });
    await prisma.bookingTask.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.bookingNote.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.bookingDocument.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.bookingReference.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.bookingSupplier.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.passenger.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.supplier.deleteMany({
      where: { name: { startsWith: `Test Supplier ${suffix}` } },
    });
    await prisma.saleSubmission.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { name: { in: roleNames } } });
    await app.close();
  });

  it('does not create a booking from an unaccepted sale', async () => {
    await request(app.getHttpServer())
      .post(`/sale-submissions/${unacceptedSaleId}/create-booking`)
      .set('Authorization', `Bearer ${opsToken}`)
      .expect(409);
  });
  it('creates a booking from an accepted sale and copies Sales data', async () => {
    const response = await request(app.getHttpServer())
      .post(`/sale-submissions/${saleId}/create-booking`)
      .set('Authorization', `Bearer ${opsToken}`)
      .expect(201);
    const body = response.body as BookingBody;
    bookingId = body.id;
    bookingIds.push(body.id);
    expect(body.folderNumber).toMatch(/^NT-\d{4}-\d{6}$/);
    expect(body).toMatchObject({
      destination: 'Destination 1',
      sellingPrice: '3200',
    });
  });
  it('prevents duplicate booking creation', async () => {
    await request(app.getHttpServer())
      .post(`/sale-submissions/${saleId}/create-booking`)
      .set('Authorization', `Bearer ${opsToken}`)
      .expect(409);
  });
  it('creates unique folder numbers under concurrent creation', async () => {
    const responses = await Promise.all(
      saleIds
        .slice(2)
        .map((id) =>
          request(app.getHttpServer())
            .post(`/sale-submissions/${id}/create-booking`)
            .set('Authorization', `Bearer ${opsToken}`),
        ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const bodies = responses.map((r) => r.body as BookingBody);
    bookingIds.push(...bodies.map((b) => b.id));
    expect(new Set(bodies.map((b) => b.folderNumber)).size).toBe(2);
  });
  it('adds passenger, supplier, and PNR reference', async () => {
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/passengers`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        firstName: 'John',
        lastName: 'Smith',
        passportNumber: 'P123456789',
        isPrimaryPassenger: true,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/suppliers`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        name: `Test Supplier ${suffix}`,
        supplierType: 'AIRLINE',
        serviceType: 'Flight',
        supplierReference: 'EK-REF',
        supplierCost: '2100.00',
        currency: 'GBP',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/references`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ type: 'PNR', reference: 'ABC123' })
      .expect(201);
  });
  it('assigns an Operations owner and sends notification', async () => {
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/assign-operations`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ userId: operationsOwnerId })
      .expect(201);
    await expect(
      prisma.notification.count({
        where: {
          userId: operationsOwnerId,
          entityId: bookingId,
          type: 'OPERATIONS_ASSIGNED',
        },
      }),
    ).resolves.toBe(1);
  });
  it('adds operational note and booking task', async () => {
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/notes`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ content: 'Supplier confirmation pending.' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/tasks`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        title: 'Ticket Passenger',
        assignedUserId: operationsOwnerId,
        dueAt: '2026-11-01T10:00:00.000Z',
      })
      .expect(201);
    await expect(
      prisma.notification.count({
        where: {
          userId: operationsOwnerId,
          entityId: bookingId,
          type: 'BOOKING_TASK_ASSIGNED',
        },
      }),
    ).resolves.toBe(1);
  });
  it('blocks an unauthorized editor', async () => {
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ destination: 'Unauthorized edit' })
      .expect(403);
  });
  it('restricts finance and masks passport data', async () => {
    const response = await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${restrictedToken}`)
      .expect(200);
    const body = response.body as BookingBody;
    expect(body.sellingPrice).toBeUndefined();
    expect(body.suppliers?.[0].supplierCost).toBeUndefined();
    expect(body.passengers?.[0].passportNumber).toBe('****6789');
  });
  it('records required booking audit events', async () => {
    const actions = (
      await prisma.auditLog.findMany({
        where: { entityType: 'Booking', entityId: bookingId },
        select: { action: true },
      })
    ).map((x) => x.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'BOOKING_CREATED',
        'FOLDER_NUMBER_GENERATED',
        'PASSENGER_ADDED',
        'SUPPLIER_ADDED',
        'BOOKING_REFERENCE_ADDED',
        'OPERATIONS_OWNER_ASSIGNED',
        'BOOKING_NOTE_ADDED',
        'BOOKING_TASK_CREATED',
      ]),
    );
  });
});
