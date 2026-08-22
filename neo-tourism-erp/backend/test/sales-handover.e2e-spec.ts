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
interface IdBody {
  id: string;
}
interface SaleBody extends IdBody {
  customer: { firstName: string; email: string | null };
}
interface PageBody {
  data: Array<{ id: string }>;
}

describe('Sale Made to Admin handover (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let salesToken: string;
  let otherSalesToken: string;
  let operationsToken: string;
  let salesUserId: string;
  let operationsUserId: string;
  let customerId: string;
  let leadId: string;
  let submissionId: string;

  const suffix = Date.now();
  const password = 'SaleHandoverTest123!';
  const roleNames = [
    `SALE_HANDOVER_AGENT_${suffix}`,
    `SALE_HANDOVER_OPS_${suffix}`,
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

    const salesCodes = [
      'lead.view',
      'sale.create',
      'sale.view_own',
      'sale.edit_own',
      'sale.submit',
    ];
    const operationsCodes = ['admin.sale_queue.view', 'admin.sale.accept'];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...salesCodes, ...operationsCodes] } },
    });
    const salesRole = await prisma.role.create({
      data: {
        name: roleNames[0],
        permissions: {
          create: permissions
            .filter(({ code }) => salesCodes.includes(code))
            .map(({ id }) => ({ permissionId: id })),
        },
      },
    });
    const operationsRole = await prisma.role.create({
      data: {
        name: roleNames[1],
        permissions: {
          create: permissions
            .filter(({ code }) => operationsCodes.includes(code))
            .map(({ id }) => ({ permissionId: id })),
        },
      },
    });
    const [salesDepartment, operationsDepartment] = await Promise.all([
      prisma.department.findUniqueOrThrow({ where: { name: 'Sales' } }),
      prisma.department.findUniqueOrThrow({
        where: { name: 'Administration / Operations' },
      }),
    ]);
    const passwordHash = await bcrypt.hash(password, 4);
    const [sales, otherSales, operations] = await Promise.all([
      prisma.user.create({
        data: {
          email: `sale-agent-${suffix}@example.com`,
          passwordHash,
          firstName: 'Anna',
          lastName: 'Taylor',
          departmentId: salesDepartment.id,
          roles: { create: { roleId: salesRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          email: `sale-other-${suffix}@example.com`,
          passwordHash,
          firstName: 'Other',
          lastName: 'Agent',
          departmentId: salesDepartment.id,
          roles: { create: { roleId: salesRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          email: `sale-ops-${suffix}@example.com`,
          passwordHash,
          firstName: 'Admin',
          lastName: 'Operator',
          departmentId: operationsDepartment.id,
          roles: { create: { roleId: operationsRole.id } },
        },
      }),
    ]);
    salesUserId = sales.id;
    operationsUserId = operations.id;

    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      return (response.body as LoginBody).accessToken;
    };
    [salesToken, otherSalesToken, operationsToken] = await Promise.all([
      login(sales.email),
      login(otherSales.email),
      login(operations.email),
    ]);

    const customer = await prisma.customer.create({
      data: {
        firstName: 'John',
        lastName: 'Smith',
        email: `john-smith-${suffix}@example.com`,
        phone: `+9477${String(suffix).slice(-7)}`,
        createdById: sales.id,
        updatedById: sales.id,
      },
    });
    customerId = customer.id;
    const lead = await prisma.lead.create({
      data: {
        customerId,
        assignedUserId: sales.id,
        assignedAt: new Date(),
        status: 'GOING_TO_BOOK',
        destination: 'Maldives Package',
        travelDate: new Date('2026-10-15T00:00:00.000Z'),
        salesNotes: 'Honeymoon package discussed.',
        createdById: sales.id,
      },
    });
    leadId = lead.id;
  });

  afterAll(async () => {
    if (submissionId) {
      await prisma.notification.deleteMany({
        where: { entityId: submissionId },
      });
      await prisma.auditLog.deleteMany({ where: { entityId: submissionId } });
      await prisma.saleSubmission.deleteMany({ where: { id: submissionId } });
    }
    if (leadId) {
      await prisma.leadActivity.deleteMany({ where: { leadId } });
      await prisma.lead.deleteMany({ where: { id: leadId } });
    }
    if (customerId)
      await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.notification.deleteMany({
      where: {
        userId: { in: [salesUserId, operationsUserId].filter(Boolean) },
      },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: `-${suffix}@example.com` } },
    });
    await prisma.role.deleteMany({ where: { name: { in: roleNames } } });
    await app.close();
  });

  it('rejects an invalid lead', async () => {
    await request(app.getHttpServer())
      .post('/leads/00000000-0000-4000-8000-000000000000/sale-made')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(404);
  });

  it('rejects an unauthorized Sales user', async () => {
    await request(app.getHttpServer())
      .post(`/leads/${leadId}/sale-made`)
      .set('Authorization', `Bearer ${otherSalesToken}`)
      .expect(403);
  });

  it('starts a pre-populated draft and records activity and audit', async () => {
    const response = await request(app.getHttpServer())
      .post(`/leads/${leadId}/sale-made`)
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(201);
    const body = response.body as SaleBody;
    submissionId = body.id;
    expect(response.body).toMatchObject({
      leadId,
      customerId,
      status: 'DRAFT',
      destination: 'Maldives Package',
      submittedByUserId: salesUserId,
    });
    expect(body.customer).toMatchObject({
      firstName: 'John',
      email: `john-smith-${suffix}@example.com`,
    });
    await expect(
      prisma.leadActivity.count({
        where: { leadId, type: 'SALE_MADE_STARTED' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { entityId: submissionId, action: 'SALE_MADE_STARTED' },
      }),
    ).resolves.toBe(1);
  });

  it('prevents a duplicate Sale Made attempt', async () => {
    await request(app.getHttpServer())
      .post(`/leads/${leadId}/sale-made`)
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(409);
  });

  it('prevents another Sales user from viewing the Payment Card', async () => {
    await request(app.getHttpServer())
      .get(`/sale-submissions/${submissionId}`)
      .set('Authorization', `Bearer ${otherSalesToken}`)
      .expect(403);
  });

  it('updates the draft', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/sale-submissions/${submissionId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        destination: 'Maldives Premium Package',
        travelStartDate: '2026-10-15',
        travelEndDate: '2026-10-22',
        depositAmount: '500.00',
        salesNotes:
          'Deposit received and reference retained on the Payment Card.',
      })
      .expect(200);
    expect(response.body).toMatchObject({
      destination: 'Maldives Premium Package',
      depositAmount: '500',
    });
  });

  it('rejects an incomplete Payment Card submission', async () => {
    await request(app.getHttpServer())
      .post(`/sale-submissions/${submissionId}/submit`)
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(400);
  });

  it('completes the draft fields and lists it for the owning Sales user', async () => {
    await request(app.getHttpServer())
      .patch(`/sale-submissions/${submissionId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        sellingPrice: '2500.00',
        currency: 'gbp',
        paymentMethod: 'BANK_TRANSFER',
        paymentReference: 'BANK-REF-PRIVATE',
      })
      .expect(200);
    const response = await request(app.getHttpServer())
      .get('/sale-submissions/my')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);
    expect(
      (response.body as PageBody).data.some(({ id }) => id === submissionId),
    ).toBe(true);
  });

  it('denies the Admin queue to Sales', async () => {
    await request(app.getHttpServer())
      .get('/admin/sales-queue')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(403);
  });

  it('submits transactionally, changes the Lead, audits, and notifies Admin', async () => {
    const response = await request(app.getHttpServer())
      .post(`/sale-submissions/${submissionId}/submit`)
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(201);
    expect(response.body).toMatchObject({ status: 'SUBMITTED_TO_ADMIN' });
    await expect(
      prisma.lead.findUniqueOrThrow({ where: { id: leadId } }),
    ).resolves.toMatchObject({ status: 'SALE_MADE' });
    await expect(
      prisma.notification.count({
        where: {
          userId: operationsUserId,
          entityId: submissionId,
          type: 'NEW_SALE',
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { entityId: submissionId, action: 'SALE_SUBMITTED_TO_ADMIN' },
      }),
    ).resolves.toBe(1);
  });

  it('makes a submitted Payment Card read-only', async () => {
    await request(app.getHttpServer())
      .patch(`/sale-submissions/${submissionId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ destination: 'Changed after submission' })
      .expect(409);
  });

  it('shows the submitted sale in the oldest-first Admin queue', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/sales-queue')
      .set('Authorization', `Bearer ${operationsToken}`)
      .expect(200);
    expect(
      (response.body as PageBody).data.some(({ id }) => id === submissionId),
    ).toBe(true);
    await request(app.getHttpServer())
      .get(`/sale-submissions/${submissionId}`)
      .set('Authorization', `Bearer ${operationsToken}`)
      .expect(200);
  });

  it('allows Admin to accept and notifies the Sales advisor', async () => {
    const response = await request(app.getHttpServer())
      .post(`/sale-submissions/${submissionId}/accept`)
      .set('Authorization', `Bearer ${operationsToken}`)
      .expect(201);
    expect(response.body).toMatchObject({ status: 'ADMIN_ACCEPTED' });
    await expect(
      prisma.notification.count({
        where: {
          userId: salesUserId,
          entityId: submissionId,
          type: 'SALE_ACCEPTED',
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { entityId: submissionId, action: 'SALE_ACCEPTED_BY_ADMIN' },
      }),
    ).resolves.toBe(1);
  });
});
