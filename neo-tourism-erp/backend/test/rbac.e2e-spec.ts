import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
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
  let departmentViewPermissionId: string;
  let userId: string;
  let userToken: string;
  const employeeIds: string[] = [];

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

  it('rejects malformed and expired JWTs', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-valid-jwt')
      .expect(401);

    const expiredToken = await app.get(JwtService).signAsync(
      {
        sub: '00000000-0000-4000-8000-000000000000',
        email: 'expired@example.com',
      },
      { expiresIn: -1 },
    );
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
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

  it('seeds role permissions required by the main workflow', async () => {
    const roles = await prisma.role.findMany({
      where: { name: { in: ['SALES', 'OPERATIONS', 'MANAGER'] } },
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
      },
    });
    const codes = (roleName: string) =>
      roles
        .find(({ name }) => name === roleName)
        ?.permissions.map(({ permission }) => permission.code) ?? [];

    expect(codes('SALES')).toEqual(
      expect.arrayContaining(['lead.assign', 'sale.create', 'sale.submit']),
    );
    expect(codes('OPERATIONS')).toEqual(
      expect.arrayContaining([
        'booking.manage_suppliers',
        'finance.edit',
        'booking.operations.complete',
      ]),
    );
    expect(codes('MANAGER')).toEqual(
      expect.arrayContaining([
        'lead.attention.view',
        'lead.attention.manage',
        'lead.reassign',
      ]),
    );
  });

  it('seeds separate hierarchy and access roles without privilege overlap', async () => {
    const roles = await prisma.role.findMany({
      where: {
        name: {
          in: [
            'EMPLOYEE',
            'MANAGER',
            'SALES',
            'HR',
            'FINANCE',
            'FINANCE_APPROVER',
            'MARKETING',
            'IT_ADMIN',
            'SYSTEM_ADMIN',
            'MANAGEMENT',
            'OWNER',
          ],
        },
      },
      include: {
        permissions: { include: { permission: { select: { code: true } } } },
      },
    });
    expect(roles).toHaveLength(11);
    const codes = (name: string) =>
      roles
        .find((role) => role.name === name)!
        .permissions.map(({ permission }) => permission.code);

    expect(codes('EMPLOYEE')).toEqual(
      expect.arrayContaining(['hr.leave.create', 'hr.leave.view_own']),
    );
    expect(codes('FINANCE')).toContain('finance.adjustment.create');
    expect(codes('FINANCE')).not.toContain('finance.adjustment.approve');
    expect(codes('FINANCE_APPROVER')).toContain('finance.adjustment.approve');
    expect(codes('IT_ADMIN')).not.toContain('user.manage_privileged_roles');
    expect(codes('SYSTEM_ADMIN')).toContain('user.manage_privileged_roles');
    expect(codes('SYSTEM_ADMIN')).not.toContain('organization.owner.manage');
    expect(codes('OWNER')).not.toContain('role.manage');
  });

  it('creates a department', async () => {
    const response = await request(app.getHttpServer())
      .post('/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: departmentName })
      .expect(201);

    departmentId = (response.body as IdentifiedRecord).id;
  });

  it('creates and returns the company reporting hierarchy independently of roles', async () => {
    const createEmployee = async (
      firstName: string,
      organizationLevel: string,
      managerId?: string,
    ) => {
      const response = await request(app.getHttpServer())
        .post('/hr/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName,
          lastName: 'Hierarchy',
          jobTitle: `${firstName} position`,
          organizationLevel,
          departmentId,
          managerId,
          employmentType: 'FULL_TIME',
          joinDate: '2026-01-01',
        })
        .expect(201);
      const id = (response.body as IdentifiedRecord).id;
      employeeIds.push(id);
      return id;
    };
    const ownerId = await createEmployee('Owner', 'OWNER');
    const headId = await createEmployee('Head', 'DEPARTMENT_HEAD', ownerId);
    const managerId = await createEmployee('Manager', 'MANAGER', headId);
    const employeeId = await createEmployee('John', 'STAFF', managerId);

    const chart = await request(app.getHttpServer())
      .get('/hr/org-chart')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(JSON.stringify(chart.body)).toContain(employeeId);

    await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organizationLevel: 'SUPERVISOR' })
      .expect(200);
    const audit = await prisma.auditLog.findFirst({
      where: {
        entityId: employeeId,
        action: 'EMPLOYEE_ORG_LEVEL_CHANGED',
      },
    });
    expect(audit).toBeTruthy();
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
    departmentViewPermissionId = departmentView!.id;

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
    const linkedEmployeeId = employeeIds.at(-1)!;
    const response = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId: linkedEmployeeId,
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
    const linkedEmployee = await prisma.employee.findUniqueOrThrow({
      where: { id: linkedEmployeeId },
      select: { userId: true },
    });
    expect(linkedEmployee.userId).toBe(userId);
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

  it('rejects a second ERP account for the same employee', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId: employeeIds.at(-1),
        firstName: 'Duplicate',
        lastName: 'Link',
        email: `duplicate-link-${uniqueSuffix}@example.com`,
        password: userPassword,
        departmentId,
        roleIds: [roleId],
      })
      .expect(409)
      .expect(({ body }: { body: { message: string } }) => {
        expect(body.message).toBe('This employee already has an ERP account.');
      });
  });

  it('returns linked HR identity and safe account metadata', async () => {
    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const user = (response.body as Array<Record<string, unknown>>).find(
      ({ id }) => id === userId,
    );
    expect(user).toMatchObject({
      email: userEmail,
      isActive: true,
      employee: { id: employeeIds.at(-1), employmentStatus: 'ACTIVE' },
    });
    expect(user).toHaveProperty('createdAt');
    expect(user).toHaveProperty('updatedAt');
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('exposes inactive employee and active ERP account mismatch data', async () => {
    await prisma.employee.update({
      where: { id: employeeIds.at(-1) },
      data: { employmentStatus: 'INACTIVE' },
    });
    const response = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (
        response.body as Array<{
          id: string;
          isActive: boolean;
          accessMismatch: boolean;
          employee: { employmentStatus: string };
        }>
      ).find(({ id }) => id === userId),
    ).toMatchObject({
      isActive: true,
      accessMismatch: true,
      employee: { employmentStatus: 'INACTIVE' },
    });
    await prisma.employee.update({
      where: { id: employeeIds.at(-1) },
      data: { employmentStatus: 'ACTIVE' },
    });
  });

  it('does not flag notice-period or on-leave employees', async () => {
    for (const employmentStatus of ['NOTICE_PERIOD', 'ON_LEAVE']) {
      await prisma.employee.update({
        where: { id: employeeIds.at(-1) },
        data: { employmentStatus: employmentStatus as never },
      });
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(
        (response.body as Array<{ id: string; accessMismatch: boolean }>).find(
          ({ id }) => id === userId,
        )?.accessMismatch,
      ).toBe(false);
    }
    await prisma.employee.update({
      where: { id: employeeIds.at(-1) },
      data: { employmentStatus: 'ACTIVE' },
    });
  });

  it('updates a unique login email without changing the employee link', async () => {
    const changedEmail = `changed-${userEmail}`;
    await request(app.getHttpServer())
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: changedEmail })
      .expect(200)
      .expect(({ body }: { body: { email: string } }) => {
        expect(body.email).toBe(changedEmail);
      });
    await request(app.getHttpServer())
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: userEmail })
      .expect(200);
    expect(
      await prisma.employee.count({
        where: { id: employeeIds.at(-1), userId },
      }),
    ).toBe(1);
  });

  it('assigns and removes multiple roles transactionally', async () => {
    const employeeRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'EMPLOYEE' },
    });
    await request(app.getHttpServer())
      .patch(`/users/${userId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [roleId, employeeRole.id] })
      .expect(200);
    const assigned = await prisma.userRole.findMany({
      where: { userId },
      select: { role: { select: { name: true } } },
    });
    expect(assigned.map(({ role }) => role.name).sort()).toEqual(
      ['EMPLOYEE', roleName].sort(),
    );
    await request(app.getHttpServer())
      .patch(`/users/${userId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [roleId] })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: userId,
          action: { in: ['USER_ROLE_ASSIGNED', 'USER_ROLE_REMOVED'] },
        },
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('resets passwords securely and audits no password values', async () => {
    const temporaryPassword = 'ReplacementPassword123!';
    await request(app.getHttpServer())
      .patch(`/users/${userId}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: temporaryPassword })
      .expect(200)
      .expect({ success: true });
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password: userPassword })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password: temporaryPassword })
      .expect(200);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: userId, action: 'PASSWORD_RESET' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(audit)).not.toContain(temporaryPassword);
    expect(JSON.stringify(audit)).not.toContain('passwordHash');
    await request(app.getHttpServer())
      .patch(`/users/${userId}/password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: userPassword })
      .expect(200);
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

  it('rejects role escalation and dangerous mass-assignment fields', async () => {
    await request(app.getHttpServer())
      .post('/roles')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ name: `ESCALATION_${uniqueSuffix}` })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/users/${userId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false, roleIds: [roleId], passwordHash: 'unsafe' })
      .expect(400);

    const unchanged = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isActive: true },
    });
    expect(unchanged.isActive).toBe(true);
  });

  it('prevents permission escalation through a role assigned to the actor', async () => {
    const [roleManage, privilegedPermission] = await Promise.all([
      prisma.permission.findUniqueOrThrow({ where: { code: 'role.manage' } }),
      prisma.permission.findUniqueOrThrow({
        where: { code: 'user.manage_privileged_roles' },
      }),
    ]);
    await request(app.getHttpServer())
      .put(`/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        permissionIds: [departmentViewPermissionId, roleManage.id],
      })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        permissionIds: [
          departmentViewPermissionId,
          roleManage.id,
          privilegedPermission.id,
        ],
      })
      .expect(403);
    await request(app.getHttpServer())
      .put(`/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionIds: [departmentViewPermissionId] })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: { entityId: roleId, action: 'ROLE_PERMISSION_UPDATED' },
      }),
    ).toBeGreaterThanOrEqual(3);
  });

  it('keeps IT support access separate from user and role administration', async () => {
    const itRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'IT' },
    });
    await request(app.getHttpServer())
      .patch(`/users/${userId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [itRole.id] })
      .expect(200);
    await request(app.getHttpServer())
      .get('/it/assets?limit=1')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/roles')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${userId}/roles`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [roleId] })
      .expect(200);
  });

  it('prevents direct self-assignment of an owner role', async () => {
    const [ownerRole, adminRoles] = await Promise.all([
      prisma.role.findUniqueOrThrow({ where: { name: 'OWNER' } }),
      prisma.userRole.findMany({
        where: { userId: (await currentAdmin()).id },
        select: { roleId: true },
      }),
    ]);
    await request(app.getHttpServer())
      .patch(`/users/${(await currentAdmin()).id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roleIds: [...adminRoles.map(({ roleId }) => roleId), ownerRole.id],
      })
      .expect(403);
  });

  it('revokes an existing token and rejects login after deactivation', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${userId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    await request(app.getHttpServer())
      .get('/departments')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password: userPassword })
      .expect(401);
  });

  it('re-enables ERP access without changing the employee record', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${userId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password: userPassword })
      .expect(200);
    expect(
      await prisma.employee.count({
        where: { id: employeeIds.at(-1), userId },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: userId,
          action: { in: ['USER_ACCESS_DISABLED', 'USER_ACCESS_ENABLED'] },
        },
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('throttles repeated login attempts', async () => {
    let throttled = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: userEmail, password: 'InvalidPassword123!' });
      if (response.status === 429) {
        throttled = true;
        break;
      }
      expect(response.status).toBe(401);
    }
    expect(throttled).toBe(true);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (employeeIds.length) {
      await prisma.employeeAccessReview.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employmentHistory.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.leaveBalance.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employeeLeavePolicy.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
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

  async function currentAdmin() {
    return prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  }
});
