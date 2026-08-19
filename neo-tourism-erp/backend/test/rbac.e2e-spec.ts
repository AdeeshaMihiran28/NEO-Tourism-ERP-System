import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    permissions: string[];
  };
}

interface IdentifiedRecord {
  id: string;
}

interface PermissionRecord extends IdentifiedRecord {
  code: string;
}

describe('Authentication and RBAC flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminToken: string;
  let departmentId: string;
  let roleId: string;
  let userId: string;
  let userToken: string;

  const uniqueSuffix = Date.now();
  const departmentName = `Test Department ${uniqueSuffix}`;
  const roleName = `TEST_ROLE_${uniqueSuffix}`;
  const userEmail = `rbac-user-${uniqueSuffix}@example.com`;
  const userPassword = 'RbacTestPassword123!';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  beforeAll(async () => {
    if (!adminPassword) {
      throw new Error('SEED_ADMIN_PASSWORD is required for RBAC e2e tests.');
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
  });

  it('rejects a protected endpoint without a JWT', async () => {
    await request(app.getHttpServer()).get('/users').expect(401);
  });

  it('rejects an invalid password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: 'InvalidPassword123!' })
      .expect(401);
  });

  it('logs in the seeded administrator', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    const body = response.body as LoginResponse;

    adminToken = body.accessToken;
    expect(body.user.email).toBe(adminEmail);
    expect(body.user.permissions).toContain('user.create');
    expect(response.body).not.toHaveProperty('user.passwordHash');
  });

  it('accepts a valid JWT on /auth/me', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toMatchObject({ email: adminEmail });
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('creates a department', async () => {
    const response = await request(app.getHttpServer())
      .post('/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: departmentName })
      .expect(201);

    departmentId = (response.body as IdentifiedRecord).id;
  });

  it('creates a role and assigns its permission set', async () => {
    const roleResponse = await request(app.getHttpServer())
      .post('/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: roleName })
      .expect(201);
    roleId = (roleResponse.body as IdentifiedRecord).id;

    const permissionResponse = await request(app.getHttpServer())
      .get('/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const permissions = permissionResponse.body as PermissionRecord[];
    const departmentView = permissions.find(
      ({ code }) => code === 'department.view',
    );

    expect(departmentView).toBeDefined();

    await request(app.getHttpServer())
      .put(`/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionIds: [departmentView?.id] })
      .expect(200)
      .expect(({ body }: { body: { permissions: unknown[] } }) => {
        expect(body.permissions).toHaveLength(1);
      });
  });

  it('creates a user with a securely stored password and assigned role', async () => {
    const response = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'RBAC',
        lastName: 'User',
        email: userEmail,
        password: userPassword,
        departmentId,
        roleIds: [roleId],
      })
      .expect(201);

    userId = (response.body as IdentifiedRecord).id;
    expect(response.body).not.toHaveProperty('passwordHash');

    const storedUser = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    expect(storedUser.passwordHash).not.toBe(userPassword);
  });

  it('rejects a duplicate user email', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Duplicate',
        lastName: 'User',
        email: userEmail,
        password: userPassword,
        departmentId,
        roleIds: [roleId],
      })
      .expect(409);
  });

  it('logs in the created user and accepts their JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password: userPassword })
      .expect(200);
    const body = response.body as LoginResponse;

    userToken = body.accessToken;
    expect(body.user.permissions).toEqual(['department.view']);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
  });

  it('allows an effective permission and denies a missing permission', async () => {
    await request(app.getHttpServer())
      .get('/departments')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('rejects login after the user is deactivated', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${userId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password: userPassword })
      .expect(401);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (roleId) {
      await prisma.role.deleteMany({ where: { id: roleId } });
    }
    if (departmentId) {
      await prisma.department.deleteMany({ where: { id: departmentId } });
    }
    if (app) {
      await app.close();
    }
  });
});
