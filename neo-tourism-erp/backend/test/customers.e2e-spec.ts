import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginBody {
  accessToken: string;
}

interface RecordBody {
  id: string;
}

interface PermissionBody extends RecordBody {
  code: string;
}

interface CustomerListBody {
  data: Array<{ id: string }>;
  pagination: { page: number; limit: number };
}

interface DuplicateBody {
  code?: string;
  possibleDuplicates?: Array<{ id: string }>;
}

describe('Customer 360 flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let customerId: string;
  let limitedRoleId: string;
  let limitedUserId: string;
  let limitedToken: string;

  const suffix = Date.now();
  const customerEmail = `customer-${suffix}@example.com`;
  const customerPhone = `+441${String(suffix).slice(-9)}`;
  const limitedEmail = `customer-viewer-${suffix}@example.com`;
  const limitedPassword = 'CustomerViewerPassword123!';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  beforeAll(async () => {
    if (!adminPassword) {
      throw new Error(
        'SEED_ADMIN_PASSWORD is required for customer e2e tests.',
      );
    }

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

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    adminToken = (login.body as LoginBody).accessToken;
  });

  it('creates a customer', async () => {
    const response = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'John',
        lastName: 'Smith',
        email: customerEmail,
        phone: customerPhone,
        secondaryPhone: '+442012345678',
        dateOfBirth: '1990-04-15',
        nationality: 'British',
        customerType: 'NEW',
      })
      .expect(201);

    customerId = (response.body as RecordBody).id;
    expect(response.body).toMatchObject({
      email: customerEmail,
      customerType: 'NEW',
      isActive: true,
    });
  });

  it('views the Customer 360 record and creation audit', async () => {
    const response = await request(app.getHttpServer())
      .get(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: customerId,
      firstName: 'John',
      summary: { totalLeads: 0, totalBookings: 0 },
    });
    await expect(
      prisma.auditLog.count({
        where: {
          entityId: customerId,
          action: 'CUSTOMER_CREATED',
        },
      }),
    ).resolves.toBe(1);
  });

  it('searches and paginates customers', async () => {
    const response = await request(app.getHttpServer())
      .get('/customers')
      .query({ search: 'John Smith', page: 1, limit: 1, customerType: 'NEW' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = response.body as CustomerListBody;
    expect(body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: customerId })]),
    );
    expect(body.pagination).toMatchObject({ page: 1, limit: 1 });
  });

  it('detects possible duplicates by email and phone', async () => {
    const duplicateEmail = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Duplicate',
        lastName: 'Email',
        email: customerEmail.toUpperCase(),
        phone: '+449999999999',
        customerType: 'NEW',
      })
      .expect(409);
    expect(duplicateEmail.body as DuplicateBody).toMatchObject({
      code: 'POSSIBLE_DUPLICATE',
    });

    const duplicatePhone = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Duplicate',
        lastName: 'Phone',
        email: `different-${suffix}@example.com`,
        phone: customerPhone,
        customerType: 'REFERRAL',
      })
      .expect(409);
    expect((duplicatePhone.body as DuplicateBody).possibleDuplicates).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: customerId })]),
    );
  });

  it('updates the customer and records old and new audit values', async () => {
    await request(app.getHttpServer())
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerType: 'REPEAT', nationality: 'Sri Lankan' })
      .expect(200)
      .expect(({ body }: { body: { customerType: string } }) => {
        expect(body.customerType).toBe('REPEAT');
      });

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: customerId, action: 'CUSTOMER_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.oldValues).toBeTruthy();
    expect(audit?.newValues).toBeTruthy();
  });

  it('returns 404 for an unknown customer', async () => {
    await request(app.getHttpServer())
      .get('/customers/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('creates and returns an attributed customer note with an audit event', async () => {
    const response = await request(app.getHttpServer())
      .post(`/customers/${customerId}/notes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: 'Passenger prefers morning calls.' })
      .expect(201);

    expect(response.body).toMatchObject({
      content: 'Passenger prefers morning calls.',
      createdBy: { email: adminEmail },
    });

    const notes = await request(app.getHttpServer())
      .get(`/customers/${customerId}/notes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(notes.body).toHaveLength(1);
    await expect(
      prisma.auditLog.count({
        where: { entityId: customerId, action: 'CUSTOMER_NOTE_CREATED' },
      }),
    ).resolves.toBe(1);
  });

  it('allows viewing but denies editing without customer.edit', async () => {
    const roleResponse = await request(app.getHttpServer())
      .post('/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `CUSTOMER_VIEWER_${suffix}` })
      .expect(201);
    limitedRoleId = (roleResponse.body as RecordBody).id;

    const permissionsResponse = await request(app.getHttpServer())
      .get('/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const customerView = (permissionsResponse.body as PermissionBody[]).find(
      ({ code }) => code === 'customer.view',
    );
    expect(customerView).toBeDefined();

    await request(app.getHttpServer())
      .put(`/roles/${limitedRoleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionIds: [customerView?.id] })
      .expect(200);

    const salesDepartment = await prisma.department.findUniqueOrThrow({
      where: { name: 'Sales' },
    });
    const userResponse = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Customer',
        lastName: 'Viewer',
        email: limitedEmail,
        password: limitedPassword,
        departmentId: salesDepartment.id,
        roleIds: [limitedRoleId],
      })
      .expect(201);
    limitedUserId = (userResponse.body as RecordBody).id;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: limitedEmail, password: limitedPassword })
      .expect(200);
    limitedToken = (login.body as LoginBody).accessToken;

    await request(app.getHttpServer())
      .get(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${limitedToken}`)
      .send({ nationality: 'Denied update' })
      .expect(403);
  });

  it('rejects an inactive user even with a previously valid token', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${limitedUserId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/customers/${customerId}`)
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(401);
  });

  afterAll(async () => {
    if (customerId) {
      await prisma.customer.deleteMany({ where: { id: customerId } });
      await prisma.auditLog.deleteMany({
        where: { entityType: 'Customer', entityId: customerId },
      });
    }
    if (limitedUserId) {
      await prisma.auditLog.deleteMany({ where: { actorId: limitedUserId } });
      await prisma.user.deleteMany({ where: { id: limitedUserId } });
    }
    if (limitedRoleId) {
      await prisma.role.deleteMany({ where: { id: limitedRoleId } });
    }
    if (app) {
      await app.close();
    }
  });
});
