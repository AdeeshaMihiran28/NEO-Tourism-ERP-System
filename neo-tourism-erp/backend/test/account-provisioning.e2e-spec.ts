import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Employee account provisioning (e2e)', () => {
  const originalShowInvitationLink = process.env.SHOW_INVITATION_LINK_IN_DEV;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let actorId: string;
  let actorRoleId: string;
  let departmentId: string;
  let positionId: string;
  let mappedRoleId: string;
  const employeeIds: string[] = [];
  const userIds: string[] = [];
  const suffix = Date.now();

  const createEmployee = (data: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/hr/employees')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Invite',
        lastName: `Employee${employeeIds.length}`,
        jobTitle: 'Provisioning Test',
        departmentId,
        employmentType: 'FULL_TIME',
        joinDate: '2026-09-16',
        positionId,
        ...data,
      });

  const rawToken = (link: string) => new URL(link).searchParams.get('token')!;

  beforeAll(async () => {
    process.env.SHOW_INVITATION_LINK_IN_DEV = 'true';
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
    // Test-only debug flag: exposes raw setup links in API responses so the
    // suite can exercise the token flow. Production never sets this.
    process.env.SHOW_INVITATION_LINK_IN_DEV = 'true';
    departmentId = (
      await prisma.department.findUniqueOrThrow({ where: { name: 'HR' } })
    ).id;
    const permissionCodes = [
      'hr.employee.create',
      'hr.employee.view',
      'hr.employee.status.manage',
      'user.edit',
    ];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });
    const actorRole = await prisma.role.create({
      data: {
        name: `PROVISIONING_ACTOR_${suffix}`,
        permissions: {
          create: permissions.map(({ id: permissionId }) => ({ permissionId })),
        },
      },
    });
    actorRoleId = actorRole.id;
    const actor = await prisma.user.create({
      data: {
        email: `provisioning-actor-${suffix}@test.local`,
        passwordHash: await bcrypt.hash('ProvisioningActor123!', 4),
        firstName: 'Provisioning',
        lastName: 'Actor',
        departmentId,
        roles: { create: { roleId: actorRole.id } },
      },
    });
    actorId = actor.id;
    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: actor.email, password: 'ProvisioningActor123!' })
        .expect(200)
    ).body.accessToken as string;
    const mappedRole = await prisma.role.create({
      data: { name: `PROVISIONED_EMPLOYEE_${suffix}` },
    });
    mappedRoleId = mappedRole.id;
    const position = await prisma.position.create({
      data: { code: `PROVISION_${suffix}`, title: 'Provisioned Employee' },
    });
    positionId = position.id;
    await prisma.positionRoleMapping.create({
      data: { positionId, roleId: mappedRoleId },
    });
  });

  it('creates an employee without an ERP user when access is not requested', async () => {
    const usersBefore = await prisma.user.count();
    const response = await createEmployee({
      workEmail: `no-access-${suffix}@test.local`,
    }).expect(201);
    employeeIds.push(response.body.id as string);
    expect(response.body.userId).toBeNull();
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it('provisions a pending linked user with AUTO roles and a hashed invitation', async () => {
    const response = await createEmployee({
      workEmail: `invited-${suffix}@test.local`,
      erpAccessRequired: true,
    }).expect(201);
    employeeIds.push(response.body.id as string);
    userIds.push(response.body.userId as string);
    expect(response.body.erpAccount).toMatchObject({
      loginEmail: `invited-${suffix}@test.local`,
      state: 'PENDING_ACTIVATION',
      roles: [`PROVISIONED_EMPLOYEE_${suffix}`],
      invitation: { delivery: 'NOT_CONFIGURED' },
    });
    const secret = rawToken(response.body.erpAccount.invitation.invitationLink);
    const invitation = await prisma.accountInvitation.findFirstOrThrow({
      where: { userId: response.body.userId },
    });
    expect(invitation.tokenHash).toBe(
      createHash('sha256').update(secret).digest('hex'),
    );
    expect(invitation.tokenHash).not.toContain(secret);
    const assignment = await prisma.userRole.findUniqueOrThrow({
      where: {
        userId_roleId: {
          userId: response.body.userId,
          roleId: mappedRoleId,
        },
      },
    });
    expect(assignment.source).toBe('POSITION_AUTO');
  });

  it('activates once, stores a bcrypt password and then permits login', async () => {
    const userId = userIds[0];
    const invitation = await prisma.accountInvitation.findFirstOrThrow({
      where: { userId },
    });
    await prisma.accountInvitation.update({
      where: { id: invitation.id },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    // Resend throttle: backdate past the one-minute window first.
    await prisma.accountInvitation.updateMany({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    const recreated = await request(app.getHttpServer())
      .post(`/users/${userId}/resend-invitation`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const secret = rawToken(recreated.body.invitationLink as string);
    const password = 'EmployeeOwnedPassword123!';
    await request(app.getHttpServer())
      .post('/auth/activate-account')
      .send({ token: secret, password, confirmPassword: password })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.isActive).toBe(true);
    expect(await bcrypt.compare(password, user.passwordHash)).toBe(true);
    expect(
      await prisma.accountInvitation.findUniqueOrThrow({
        where: { id: invitation.id },
      }),
    ).toMatchObject({ invalidatedAt: expect.any(Date) });
    await request(app.getHttpServer())
      .post('/auth/activate-account')
      .send({ token: secret, password, confirmPassword: password })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password })
      .expect(200);
  });

  it('denies expired and terminated-employee invitations', async () => {
    const expired = await createEmployee({
      workEmail: `expired-${suffix}@test.local`,
      erpAccessRequired: true,
    }).expect(201);
    employeeIds.push(expired.body.id as string);
    userIds.push(expired.body.userId as string);
    const expiredSecret = rawToken(
      expired.body.erpAccount.invitation.invitationLink as string,
    );
    await prisma.accountInvitation.updateMany({
      where: { userId: expired.body.userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .post('/auth/activate-account')
      .send({
        token: expiredSecret,
        password: 'ExpiredPassword123!',
        confirmPassword: 'ExpiredPassword123!',
      })
      .expect(400);

    const terminated = await createEmployee({
      workEmail: `terminated-${suffix}@test.local`,
      erpAccessRequired: true,
    }).expect(201);
    employeeIds.push(terminated.body.id as string);
    userIds.push(terminated.body.userId as string);
    const terminatedSecret = rawToken(
      terminated.body.erpAccount.invitation.invitationLink as string,
    );
    await request(app.getHttpServer())
      .patch(`/hr/employees/${terminated.body.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'TERMINATED', reason: 'Provisioning regression' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/activate-account')
      .send({
        token: terminatedSecret,
        password: 'TerminatedPassword123!',
        confirmPassword: 'TerminatedPassword123!',
      })
      .expect(400);
    const terminatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: terminated.body.userId },
    });
    expect(terminatedUser.isActive).toBe(false);
  });

  afterAll(async () => {
    delete process.env.SHOW_INVITATION_LINK_IN_DEV;
    if (prisma) {
      const allUsers = [actorId, ...userIds];
      await prisma.notification.deleteMany({
        where: { userId: { in: allUsers } },
      });
      await prisma.employeeAccessReview.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.leaveBalance.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employeeLeavePolicy.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employmentHistory.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
      await prisma.accountInvitation.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.userRole.deleteMany({ where: { userId: { in: allUsers } } });
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: allUsers } },
      });
      await prisma.user.deleteMany({ where: { id: { in: allUsers } } });
      await prisma.positionRoleMapping.deleteMany({ where: { positionId } });
      await prisma.position.deleteMany({ where: { id: positionId } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: actorRoleId },
      });
      await prisma.role.deleteMany({
        where: { id: { in: [actorRoleId, mappedRoleId] } },
      });
    }
    if (app) await app.close();
    if (originalShowInvitationLink === undefined)
      delete process.env.SHOW_INVITATION_LINK_IN_DEV;
    else process.env.SHOW_INVITATION_LINK_IN_DEV = originalShowInvitationLink;
  });
});
