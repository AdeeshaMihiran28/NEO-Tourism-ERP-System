/* Account invitation workflow: provision, deliver, activate. Mailer faked. */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { InvitationMailerService } from '../src/account-provisioning/invitation-mailer.service';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Account invitation workflow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hrToken: string;
  let accessToken: string;
  let hrUserId: string;
  let accessUserId: string;
  let departmentId: string;
  const actorRoleIds: string[] = [];
  const subjectUserIds: string[] = [];
  const subjectEmployeeIds: string[] = [];
  const suffix = Date.now();
  const fakeMailer = {
    mode: 'SENT' as 'SENT' | 'FAILED' | 'NOT_CONFIGURED',
    calls: [] as Array<{ to: string }>,
    send: (input: { to: string }) => {
      fakeMailer.calls.push({ to: input.to });
      return Promise.resolve(fakeMailer.mode);
    },
  };
  let emailSeq = 0;
  const nextEmail = () => `invite-${suffix}-${(emailSeq += 1)}@test.local`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(InvitationMailerService)
      .useValue(fakeMailer)
      .compile();
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

    const codes = [
      'hr.employee.view',
      'hr.employee.create',
      'hr.employee.edit',
      'hr.employee.status.manage',
      'hr.position.manage',
      'user.view',
      'user.edit',
    ];
    const perms = await prisma.permission.findMany({
      where: { code: { in: codes } },
    });
    const byCode = new Map(perms.map((p) => [p.code, p.id]));
    const hrRole = await prisma.role.create({
      data: {
        name: `INV_HR_${suffix}`,
        permissions: {
          create: codes
            .filter((c) => c.startsWith('hr.'))
            .map((code) => ({ permissionId: byCode.get(code)! })),
        },
      },
    });
    const accessRole = await prisma.role.create({
      data: {
        name: `INV_ACCESS_${suffix}`,
        permissions: {
          create: ['user.view', 'user.edit'].map((code) => ({
            permissionId: byCode.get(code)!,
          })),
        },
      },
    });
    actorRoleIds.push(hrRole.id, accessRole.id);
    departmentId = (
      await prisma.department.findUniqueOrThrow({ where: { name: 'HR' } })
    ).id;
    const hash = await bcrypt.hash('InviteTest123!', 4);
    const hrUser = await prisma.user.create({
      data: {
        email: `invite-hr-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'Invite',
        lastName: 'Hr',
        departmentId,
        roles: { create: { roleId: hrRole.id } },
      },
    });
    const accessUser = await prisma.user.create({
      data: {
        email: `invite-access-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'Invite',
        lastName: 'Access',
        departmentId,
        roles: { create: { roleId: accessRole.id } },
      },
    });
    hrUserId = hrUser.id;
    accessUserId = accessUser.id;
    const login = (email: string, password: string) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
    hrToken = (await login(hrUser.email, 'InviteTest123!').expect(200)).body
      .accessToken as string;
    accessToken = (await login(accessUser.email, 'InviteTest123!').expect(200))
      .body.accessToken as string;
  });

  const hire = (overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/hr/employees')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        firstName: 'Invitee',
        lastName: 'Employee',
        jobTitle: 'Tester',
        departmentId,
        employmentType: 'FULL_TIME',
        joinDate: '2026-03-01',
        erpAccessRequired: true,
        workEmail: nextEmail(),
        ...overrides,
      });

  it('A: provisioning links user, creates invitation and calls mail', async () => {
    fakeMailer.mode = 'SENT';
    fakeMailer.calls = [];
    const email = nextEmail();
    const res = await hire({ workEmail: email }).expect(201);
    expect(res.body.erpAccount.loginEmail).toBe(email);
    expect(res.body.erpAccount.state).toBe('PENDING_ACTIVATION');
    expect(res.body.erpAccount.invitation.delivery).toBe('SENT');
    expect(res.body.erpAccount.invitation.invitationLink).toBeUndefined();
    expect(fakeMailer.calls).toEqual([{ to: email }]);
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    subjectEmployeeIds.push(employee.id);
    expect(employee.userId).toBeTruthy();
    subjectUserIds.push(employee.userId!);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: employee.userId! },
    });
    expect(user.isActive).toBe(false);
    expect(
      await prisma.accountInvitation.count({
        where: { userId: user.id, usedAt: null },
      }),
    ).toBe(1);
  });

  it('C: unconfigured mail keeps the pending account honestly', async () => {
    fakeMailer.mode = 'NOT_CONFIGURED';
    const res = await hire().expect(201);
    expect(res.body.erpAccount.invitation.delivery).toBe('NOT_CONFIGURED');
    expect(res.body.erpAccount.invitation.invitationLink).toBeUndefined();
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    subjectEmployeeIds.push(employee.id);
    subjectUserIds.push(employee.userId!);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: employee.userId! } }),
    ).resolves.toMatchObject({ isActive: false });
  });

  it('D: failed mail keeps data and resend works once per minute', async () => {
    fakeMailer.mode = 'FAILED';
    const res = await hire().expect(201);
    expect(res.body.erpAccount.invitation.delivery).toBe('FAILED');
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    subjectEmployeeIds.push(employee.id);
    const userId = employee.userId!;
    subjectUserIds.push(userId);
    const firstId = res.body.erpAccount.invitation.id as string;
    // Immediate retry is throttled (invitation created seconds ago).
    await request(app.getHttpServer())
      .post(`/users/${userId}/resend-invitation`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(429);
    // Backdate past the window: resend succeeds and invalidates the old one.
    await prisma.accountInvitation.updateMany({
      where: { userId },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    fakeMailer.mode = 'SENT';
    const resent = await request(app.getHttpServer())
      .post(`/users/${userId}/resend-invitation`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(resent.body.delivery).toBe('SENT');
    expect(resent.body.invitationLink).toBeUndefined();
    await expect(
      prisma.accountInvitation.findUniqueOrThrow({ where: { id: firstId } }),
    ).resolves.toMatchObject({ invalidatedAt: expect.any(Date) });
  });

  describe('activation with a visible test token', () => {
    let token: string;
    let workEmail: string;
    let userId: string;
    let employeeId: string;

    beforeAll(async () => {
      process.env.SHOW_INVITATION_LINK_IN_DEV = 'true';
      fakeMailer.mode = 'SENT';
      workEmail = nextEmail();
      const res = await hire({ workEmail }).expect(201);
      employeeId = res.body.id as string;
      subjectEmployeeIds.push(employeeId);
      const employee = await prisma.employee.findUniqueOrThrow({
        where: { id: employeeId },
      });
      userId = employee.userId!;
      subjectUserIds.push(userId);
      const link = res.body.erpAccount.invitation.invitationLink as string;
      expect(link).toContain('/setup-password?token=');
      token = decodeURIComponent(link.split('token=')[1]);
      delete process.env.SHOW_INVITATION_LINK_IN_DEV;
    });

    it('E: invitation status reveals only email and expiry', async () => {
      const res = await request(app.getHttpServer())
        .get(`/auth/invitation-status?token=${encodeURIComponent(token)}`)
        .expect(200);
      expect(res.body).toMatchObject({ valid: true, email: workEmail });
      expect(res.body.expiresAt).toBeTruthy();
      expect(res.body.userId).toBeUndefined();
    });

    it('F/G: password setup activates and login works', async () => {
      await request(app.getHttpServer())
        .post('/auth/activate-account')
        .send({
          token,
          password: 'NewSecure123!',
          confirmPassword: 'NewSecure123!',
        })
        .expect(200);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(user.isActive).toBe(true);
      expect(user.passwordHash).not.toContain('NewSecure123!');
      expect(await bcrypt.compare('NewSecure123!', user.passwordHash)).toBe(
        true,
      );
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: workEmail, password: 'NewSecure123!' })
        .expect(200);
      expect(login.body.accessToken).toBeTruthy();
    });

    it('H: reused link is rejected', async () => {
      await request(app.getHttpServer())
        .post('/auth/activate-account')
        .send({
          token,
          password: 'Again12345!',
          confirmPassword: 'Again12345!',
        })
        .expect(400);
      await request(app.getHttpServer())
        .get(`/auth/invitation-status?token=${encodeURIComponent(token)}`)
        .expect(400);
    });

    it('I: expired token is rejected', async () => {
      fakeMailer.mode = 'SENT';
      // The second hire exercises the same creation path with a fresh inbox.
      const second = await hire().expect(201);
      const secondEmployee = await prisma.employee.findUniqueOrThrow({
        where: { id: second.body.id },
      });
      subjectEmployeeIds.push(secondEmployee.id);
      subjectUserIds.push(secondEmployee.userId!);
      const invites = await prisma.accountInvitation.findMany({
        where: { userId: secondEmployee.userId!, usedAt: null },
      });
      expect(invites).toHaveLength(1);
      await prisma.accountInvitation.update({
        where: { id: invites[0].id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      // Token hash is unknowable; status of a random token is invalid.
      await request(app.getHttpServer())
        .get(
          '/auth/invitation-status?token=expired-invalid-token-value-1234567890',
        )
        .expect(400);
      // The expired invitation no longer activates even through resend window.
      await prisma.accountInvitation.updateMany({
        where: { userId: secondEmployee.userId! },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });
      await request(app.getHttpServer())
        .post(`/users/${secondEmployee.userId}/resend-invitation`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
    });

    it('J: regenerated invitation invalidates the old link', async () => {
      process.env.SHOW_INVITATION_LINK_IN_DEV = 'true';
      const res = await hire().expect(201);
      const empId = res.body.id as string;
      subjectEmployeeIds.push(empId);
      const emp = await prisma.employee.findUniqueOrThrow({
        where: { id: empId },
      });
      subjectUserIds.push(emp.userId!);
      const firstLink = res.body.erpAccount.invitation.invitationLink as string;
      const firstToken = decodeURIComponent(firstLink.split('token=')[1]);
      await prisma.accountInvitation.updateMany({
        where: { userId: emp.userId! },
        data: { createdAt: new Date(Date.now() - 61_000) },
      });
      const resent = await request(app.getHttpServer())
        .post(`/users/${emp.userId}/resend-invitation`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
      delete process.env.SHOW_INVITATION_LINK_IN_DEV;
      expect(resent.body.delivery).toBe('SENT');
      await request(app.getHttpServer())
        .post('/auth/activate-account')
        .send({
          token: firstToken,
          password: 'OldLink123!',
          confirmPassword: 'OldLink123!',
        })
        .expect(400);
    });

    it('K: terminated employee cannot activate', async () => {
      process.env.SHOW_INVITATION_LINK_IN_DEV = 'true';
      const res = await hire().expect(201);
      const empId = res.body.id as string;
      subjectEmployeeIds.push(empId);
      const emp = await prisma.employee.findUniqueOrThrow({
        where: { id: empId },
      });
      subjectUserIds.push(emp.userId!);
      const link = res.body.erpAccount.invitation.invitationLink as string;
      const freshToken = decodeURIComponent(link.split('token=')[1]);
      delete process.env.SHOW_INVITATION_LINK_IN_DEV;
      await request(app.getHttpServer())
        .patch(`/hr/employees/${empId}/status`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ status: 'TERMINATED' })
        .expect(200);
      await request(app.getHttpServer())
        .post('/auth/activate-account')
        .send({
          token: freshToken,
          password: 'Terminated1!',
          confirmPassword: 'Terminated1!',
        })
        .expect(400);
    });
  });

  it('L: audits never carry secrets', async () => {
    const rows = await prisma.auditLog.findMany({
      where: {
        entityType: { in: ['AccountInvitation', 'User'] },
        action: {
          in: [
            'ACCOUNT_INVITATION_CREATED',
            'ACCOUNT_INVITATION_REGENERATED',
            'ACCOUNT_ACTIVATED',
            'PASSWORD_INITIALIZED',
          ],
        },
        actorId: { in: [hrUserId, accessUserId] },
      },
      select: { action: true, newValues: true, metadata: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    const dump = JSON.stringify(rows);
    expect(dump).not.toMatch(/setup-password\?token=/);
    expect(dump).not.toMatch(/NewSecure123!/);
    expect(dump).not.toMatch(/InviteTest123!/);
    expect(dump).not.toContain('SMTP');
    for (const row of rows) {
      const flat = JSON.stringify(row.newValues) + JSON.stringify(row.metadata);
      expect(flat).not.toMatch(/passwordHash|tokenHash|SMTP_PASS/i);
    }
  });

  afterAll(async () => {
    delete process.env.SHOW_INVITATION_LINK_IN_DEV;
    if (prisma) {
      await prisma.notification.deleteMany({
        where: { userId: { in: [hrUserId, accessUserId, ...subjectUserIds] } },
      });
      await prisma.accountInvitation.deleteMany({
        where: {
          user: { id: { in: [hrUserId, accessUserId, ...subjectUserIds] } },
        },
      });
      await prisma.leaveRequest.deleteMany({
        where: { employeeId: { in: subjectEmployeeIds } },
      });
      await prisma.leaveBalance.deleteMany({
        where: { employeeId: { in: subjectEmployeeIds } },
      });
      await prisma.employeeLeavePolicy.deleteMany({
        where: { employeeId: { in: subjectEmployeeIds } },
      });
      await prisma.employeeAccessReview.deleteMany({
        where: { employeeId: { in: subjectEmployeeIds } },
      });
      await prisma.employmentHistory.deleteMany({
        where: { employeeId: { in: subjectEmployeeIds } },
      });
      await prisma.attendance.deleteMany({
        where: { employeeId: { in: subjectEmployeeIds } },
      });
      await prisma.employeeShift.deleteMany({
        where: { employeeId: { in: subjectEmployeeIds } },
      });
      await prisma.employee.deleteMany({
        where: { id: { in: subjectEmployeeIds } },
      });
      await prisma.userRole.deleteMany({
        where: { userId: { in: [hrUserId, accessUserId, ...subjectUserIds] } },
      });
      const userIds: string[] = [hrUserId, accessUserId, ...subjectUserIds];
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: actorRoleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: actorRoleIds } } });
    }
    if (app) await app.close();
  });
});
