/* Position-based access control: auto vs manual roles, privileged routing. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Position access control (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hrToken: string;
  let accessToken: string;
  let hrUserId: string;
  let accessUserId: string;
  let subjectUserId: string;
  let subjectEmployeeId: string;
  let departmentId: string;
  const roleIds: Record<string, string> = {};
  const positionIds: Record<string, string> = {};
  const actorRoleIds: string[] = [];
  const actorUserIds: string[] = [];
  const subjectIds: string[] = [];
  const positionIdsAll: string[] = [];
  const suffix = Date.now();
  const subjectPassword = 'PositionTest123!';

  const rolesOf = (userId: string) =>
    prisma.userRole.findMany({
      where: { userId },
      include: { role: { select: { name: true } } },
      orderBy: { role: { name: 'asc' } },
    });
  const roleNames = async (userId: string) =>
    (await rolesOf(userId)).map(({ role }) => role.name);
  const autoNames = async (userId: string) =>
    (await rolesOf(userId))
      .filter(({ source }) => source === 'POSITION_AUTO')
      .map(({ role }) => role.name);

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

    const hrCodes = [
      'hr.employee.view',
      'hr.employee.create',
      'hr.employee.edit',
      'hr.employee.status.manage',
      'hr.position.manage',
    ];
    const accessCodes = [
      'role.view',
      'role.manage',
      'user.view',
      'user.edit',
      'user.manage_roles',
      'hr.access_review.view',
      'hr.access_review.manage',
    ];
    const perms = await prisma.permission.findMany({
      where: { code: { in: [...hrCodes, ...accessCodes] } },
    });
    const permByCode = new Map(perms.map((p) => [p.code, p.id]));
    const hrRole = await prisma.role.create({
      data: {
        name: `POS_HR_${suffix}`,
        permissions: {
          create: hrCodes.map((code) => ({
            permissionId: permByCode.get(code)!,
          })),
        },
      },
    });
    const accessRole = await prisma.role.create({
      data: {
        name: `POS_ACCESS_${suffix}`,
        permissions: {
          create: accessCodes.map((code) => ({
            permissionId: permByCode.get(code)!,
          })),
        },
      },
    });
    actorRoleIds.push(hrRole.id, accessRole.id);
    departmentId = (
      await prisma.department.findUniqueOrThrow({ where: { name: 'HR' } })
    ).id;
    const hash = await bcrypt.hash('ActorTest123!', 4);
    const hrUser = await prisma.user.create({
      data: {
        email: `pos-hr-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'Pos',
        lastName: 'Hr',
        departmentId,
        roles: { create: { roleId: hrRole.id } },
      },
    });
    const accessUser = await prisma.user.create({
      data: {
        email: `pos-access-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'Pos',
        lastName: 'Access',
        departmentId,
        roles: { create: { roleId: accessRole.id } },
      },
    });
    hrUserId = hrUser.id;
    accessUserId = accessUser.id;
    actorUserIds.push(hrUserId, accessUserId);
    const login = (email: string, password: string) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
    hrToken = (await login(hrUser.email, 'ActorTest123!').expect(200)).body
      .accessToken as string;
    accessToken = (await login(accessUser.email, 'ActorTest123!').expect(200))
      .body.accessToken as string;

    // Business roles under test (suffix avoids seed collisions).
    for (const name of ['EMP', 'SALES', 'MGR', 'FIN', 'MKT', 'REP']) {
      const role = await request(app.getHttpServer())
        .post('/roles')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: `POS_${name}_${suffix}` })
        .expect(201);
      roleIds[name] = role.body.id as string;
    }
    // Distinctive permissions prove effective-permission derivation.
    for (const code of [`pos.alpha.${suffix}`, `pos.beta.${suffix}`]) {
      await prisma.permission.create({ data: { code } });
    }
    const salesRoleId = roleIds.SALES;
    const mgrRoleId = roleIds.MGR;
    const alpha = await prisma.permission.findUniqueOrThrow({
      where: { code: `pos.alpha.${suffix}` },
    });
    const beta = await prisma.permission.findUniqueOrThrow({
      where: { code: `pos.beta.${suffix}` },
    });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: salesRoleId, permissionId: alpha.id },
        { roleId: mgrRoleId, permissionId: beta.id },
      ],
    });

    // Positions under test.
    const mkPosition = async (code: string, title: string) => {
      const res = await request(app.getHttpServer())
        .post('/positions')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ code: `${code}_${suffix}`, title })
        .expect(201);
      positionIds[code] = res.body.id as string;
      positionIdsAll.push(res.body.id as string);
    };
    await mkPosition('EXEC', 'Sales Executive');
    await mkPosition('MGRPOS', 'Sales Manager');
    await mkPosition('FINPOS', 'Finance Executive');
    await mkPosition('MKTPOS', 'Marketing Executive');

    const map = (position: string, role: string) =>
      request(app.getHttpServer())
        .post('/positions/mappings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ positionId: positionIds[position], roleId: roleIds[role] })
        .expect(201);
    await map('EXEC', 'EMP');
    await map('EXEC', 'SALES');
    await map('MGRPOS', 'EMP');
    await map('MGRPOS', 'SALES');
    await map('MGRPOS', 'MGR');
    await map('FINPOS', 'EMP');
    await map('FINPOS', 'FIN');
    await map('MKTPOS', 'EMP');
    await map('MKTPOS', 'MKT');

    // Subject with login + linked employee at EXEC.
    const subjectHash = await bcrypt.hash(subjectPassword, 4);
    const subject = await prisma.user.create({
      data: {
        email: `pos-subject-${suffix}@test.local`,
        passwordHash: subjectHash,
        firstName: 'Pos',
        lastName: 'Subject',
        departmentId,
      },
    });
    subjectUserId = subject.id;
    subjectIds.push(subjectUserId);
    const created = await request(app.getHttpServer())
      .post('/hr/employees')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        userId: subjectUserId,
        firstName: 'Pos',
        lastName: 'Subject',
        jobTitle: 'Sales Executive',
        departmentId,
        employmentType: 'FULL_TIME',
        joinDate: '2026-01-05',
        positionId: positionIds.EXEC,
      })
      .expect(201);
    subjectEmployeeId = created.body.id as string;
  });

  it('A: hiring with a position grants mapped auto roles', async () => {
    expect(await roleNames(subjectUserId)).toEqual([
      `POS_EMP_${suffix}`,
      `POS_SALES_${suffix}`,
    ]);
    expect(await autoNames(subjectUserId)).toEqual([
      `POS_EMP_${suffix}`,
      `POS_SALES_${suffix}`,
    ]);
  });

  it('promotion adds the new auto role and keeps the rest', async () => {
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ positionId: positionIds.MGRPOS, changeReason: 'Promotion' })
      .expect(200);
    expect(await roleNames(subjectUserId)).toEqual([
      `POS_EMP_${suffix}`,
      `POS_MGR_${suffix}`,
      `POS_SALES_${suffix}`,
    ]);
    expect(await autoNames(subjectUserId)).toEqual([
      `POS_EMP_${suffix}`,
      `POS_MGR_${suffix}`,
      `POS_SALES_${suffix}`,
    ]);
  });

  it('transfer removes obsolete auto roles and adds new ones', async () => {
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ positionId: positionIds.FINPOS, changeReason: 'Transfer' })
      .expect(200);
    expect(await roleNames(subjectUserId)).toEqual([
      `POS_EMP_${suffix}`,
      `POS_FIN_${suffix}`,
    ]);
  });

  it('demotion removes the higher auto role', async () => {
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ positionId: positionIds.EXEC, changeReason: 'Demotion' })
      .expect(200);
    expect(await roleNames(subjectUserId)).toEqual([
      `POS_EMP_${suffix}`,
      `POS_SALES_${suffix}`,
    ]);
    expect(await autoNames(subjectUserId)).toEqual([
      `POS_EMP_${suffix}`,
      `POS_SALES_${suffix}`,
    ]);
  });

  it('manual roles survive position changes without duplication', async () => {
    // Explicit IT assignment keeps existing AUTO tags and adds the rest as
    // MANUAL — the transfer below must still remove obsolete AUTO rows.
    await request(app.getHttpServer())
      .patch(`/users/${subjectUserId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        roleIds: [roleIds.EMP, roleIds.SALES, roleIds.MGR, roleIds.REP],
      })
      .expect(200);
    const mgrRows = await prisma.userRole.findMany({
      where: { userId: subjectUserId, roleId: roleIds.MGR },
    });
    expect(mgrRows).toHaveLength(1);
    expect(mgrRows[0].source).toBe('MANUAL');
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ positionId: positionIds.MKTPOS })
      .expect(200);
    expect(await roleNames(subjectUserId)).toEqual([
      `POS_EMP_${suffix}`,
      `POS_MGR_${suffix}`,
      `POS_MKT_${suffix}`,
      `POS_REP_${suffix}`,
    ]);
    expect(await autoNames(subjectUserId)).toEqual([
      `POS_EMP_${suffix}`,
      `POS_MKT_${suffix}`,
    ]);
    // Back to a position mapping MANAGER: still one MANUAL row, never AUTO.
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ positionId: positionIds.MGRPOS })
      .expect(200);
    const after = await prisma.userRole.findMany({
      where: { userId: subjectUserId, roleId: roleIds.MGR },
    });
    expect(after).toHaveLength(1);
    expect(after[0].source).toBe('MANUAL');
    expect(await autoNames(subjectUserId)).toEqual([
      `POS_EMP_${suffix}`,
      `POS_SALES_${suffix}`,
    ]);
  });

  it('manually removed roles are not re-added by resync', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${subjectUserId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        roleIds: [roleIds.EMP, roleIds.SALES, roleIds.MGR],
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/positions/${positionIds.MGRPOS}/sync`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.employeesChanged).toBe(0));
    expect(await roleNames(subjectUserId)).not.toContain(`POS_REP_${suffix}`);
  });

  it('derives effective permissions from RolePermission', async () => {
    const res = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const subject = (
      res.body as Array<{
        id: string;
        permissions: string[];
        rolesDetailed: Array<{ name: string; source: string }>;
      }>
    ).find(({ id }) => id === subjectUserId)!;
    expect(subject.permissions).toEqual(
      expect.arrayContaining([`pos.alpha.${suffix}`, `pos.beta.${suffix}`]),
    );
    expect(subject.rolesDetailed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: `POS_SALES_${suffix}` }),
      ]),
    );
  });

  it('disabled users sync rows but stay disabled and locked out', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${subjectUserId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ positionId: positionIds.FINPOS })
      .expect(200);
    // Sync still applied while disabled: FIN added, SALES auto-removed.
    expect(await roleNames(subjectUserId)).toContain(`POS_FIN_${suffix}`);
    expect(await roleNames(subjectUserId)).not.toContain(`POS_SALES_${suffix}`);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: subjectUserId } }),
    ).resolves.toMatchObject({ isActive: false });
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: `pos-subject-${suffix}@test.local`,
        password: subjectPassword,
      })
      .expect(401);
    expect(
      await prisma.auditLog.count({
        where: { entityId: subjectUserId, action: 'USER_ACCESS_ENABLED' },
      }),
    ).toBe(0);
    // Reactivation recalculates roles without enabling the account.
    await request(app.getHttpServer())
      .patch(`/users/${subjectUserId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: true })
      .expect(200);
  });

  it('inactive employees skip sync; reactivation recalculates', async () => {
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}/status`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ status: 'INACTIVE' })
      .expect(200);
    const before = await roleNames(subjectUserId);
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ positionId: positionIds.MKTPOS })
      .expect(200);
    expect(await roleNames(subjectUserId)).toEqual(before);
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}/status`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(await roleNames(subjectUserId)).toContain(`POS_MKT_${suffix}`);
  });

  it('position-less change paths never touch roles', async () => {
    const finance = await prisma.department.findUniqueOrThrow({
      where: { name: 'Finance' },
    });
    const before = await rolesOf(subjectUserId);
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ departmentId: finance.id, jobTitle: 'System Administrator' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ organizationLevel: 'MANAGER' })
      .expect(200);
    expect(await rolesOf(subjectUserId)).toEqual(before);
    expect(await roleNames(subjectUserId)).not.toContain('SYSTEM_ADMIN');
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ organizationLevel: 'OWNER' })
      .expect(403);
  });

  it('privileged mappings require approval and never auto-grant', async () => {
    const sysAdmin = await prisma.role.findUniqueOrThrow({
      where: { name: 'SYSTEM_ADMIN' },
    });
    // Subject moves under EXEC so the privileged mapping below applies.
    await request(app.getHttpServer())
      .patch(`/hr/employees/${subjectEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ positionId: positionIds.EXEC })
      .expect(200);
    const created = await request(app.getHttpServer())
      .post('/positions/mappings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        positionId: positionIds.EXEC,
        roleId: sysAdmin.id,
        requiresApproval: false,
      })
      .expect(201);
    expect(created.body.requiresApproval).toBe(true);
    expect(created.body.approvalEnforced).toBe(true);
    await request(app.getHttpServer())
      .post(`/positions/${positionIds.EXEC}/sync`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(
      await prisma.userRole.findFirst({
        where: { userId: subjectUserId, roleId: sysAdmin.id },
      }),
    ).toBeNull();
    const reviews = await prisma.employeeAccessReview.findMany({
      where: {
        employeeId: subjectEmployeeId,
        triggerType: 'POSITION_CHANGE',
        status: 'PENDING',
      },
    });
    expect(reviews).toHaveLength(1);
    expect(reviews[0].recommendedRoles).toContain(sysAdmin.id);
    await request(app.getHttpServer())
      .patch(`/hr/access-reviews/${reviews[0].id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'COMPLETED', approvedRoleIds: [sysAdmin.id] })
      .expect(200);
    const granted = await prisma.userRole.findFirstOrThrow({
      where: { userId: subjectUserId, roleId: sysAdmin.id },
    });
    expect(granted.source).toBe('MANUAL');
    await prisma.userRole.delete({
      where: { userId_roleId: { userId: subjectUserId, roleId: sysAdmin.id } },
    });
    await request(app.getHttpServer())
      .delete(`/positions/mappings/${created.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('ownership split: HR cannot manage mappings, access admin cannot manage positions', async () => {
    await request(app.getHttpServer())
      .post('/positions/mappings')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ positionId: positionIds.EXEC, roleId: roleIds.EMP })
      .expect(403);
    await request(app.getHttpServer())
      .post('/positions')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ code: `NOPE_${suffix}`, title: 'Nope' })
      .expect(403);
  });

  it('self-escalation through mappings or direct assignment fails', async () => {
    const sysAdmin = await prisma.role.findUniqueOrThrow({
      where: { name: 'SYSTEM_ADMIN' },
    });
    const forced = await request(app.getHttpServer())
      .post('/positions/mappings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        positionId: positionIds.MKTPOS,
        roleId: sysAdmin.id,
        requiresApproval: false,
      })
      .expect(201);
    expect(forced.body.requiresApproval).toBe(true);
    expect(
      await prisma.userRole.findFirst({
        where: { userId: accessUserId, roleId: sysAdmin.id },
      }),
    ).toBeNull();
    await request(app.getHttpServer())
      .delete(`/positions/mappings/${forced.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    // Direct privileged self-grant is denied by the existing user guard.
    const own = await prisma.userRole.findMany({
      where: { userId: accessUserId },
      select: { roleId: true },
    });
    await request(app.getHttpServer())
      .patch(`/users/${accessUserId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        roleIds: [...own.map(({ roleId }) => roleId), sysAdmin.id],
      })
      .expect(403);
  });

  it('no-user employees update cleanly without provisioning', async () => {
    const usersBefore = await prisma.user.count();
    const res = await request(app.getHttpServer())
      .post('/hr/employees')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        firstName: 'No',
        lastName: 'Account',
        jobTitle: 'Temp',
        departmentId,
        employmentType: 'TEMPORARY',
        joinDate: '2026-02-01',
        positionId: positionIds.EXEC,
      })
      .expect(201);
    expect(res.body.userId).toBeNull();
    expect(await prisma.user.count()).toBe(usersBefore);
    await prisma.leaveBalance.deleteMany({
      where: { employeeId: res.body.id },
    });
    await prisma.employeeLeavePolicy.deleteMany({
      where: { employeeId: res.body.id },
    });
    await prisma.employmentHistory.deleteMany({
      where: { employeeId: res.body.id },
    });
    await prisma.employee.delete({ where: { id: res.body.id } });
  });

  it('mapping deletion resyncs holders without touching manual rows', async () => {
    const tmp = await request(app.getHttpServer())
      .post('/positions')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ code: `TMP_${suffix}`, title: 'Temporary' })
      .expect(201);
    positionIdsAll.push(tmp.body.id as string);
    const mapping = await request(app.getHttpServer())
      .post('/positions/mappings')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ positionId: tmp.body.id, roleId: roleIds.REP })
      .expect(201);
    const hash = await bcrypt.hash(subjectPassword, 4);
    const extra = await prisma.user.create({
      data: {
        email: `pos-extra-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'Pos',
        lastName: 'Extra',
        departmentId,
      },
    });
    subjectIds.push(extra.id);
    const emp = await request(app.getHttpServer())
      .post('/hr/employees')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        userId: extra.id,
        firstName: 'Pos',
        lastName: 'Extra',
        jobTitle: 'Temp',
        departmentId,
        employmentType: 'TEMPORARY',
        joinDate: '2026-02-01',
        positionId: tmp.body.id,
      })
      .expect(201);
    expect(await autoNames(extra.id)).toEqual([`POS_REP_${suffix}`]);
    await request(app.getHttpServer())
      .delete(`/positions/mappings/${mapping.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(await autoNames(extra.id)).toEqual([]);
    // Manual rows on the same role survive mapping deletion.
    await prisma.userRole.create({
      data: { userId: extra.id, roleId: roleIds.REP, source: 'MANUAL' },
    });
    await request(app.getHttpServer())
      .post(`/positions/${tmp.body.id}/sync`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(await roleNames(extra.id)).toEqual([`POS_REP_${suffix}`]);
    await prisma.leaveBalance.deleteMany({
      where: { employeeId: emp.body.id },
    });
    await prisma.employeeLeavePolicy.deleteMany({
      where: { employeeId: emp.body.id },
    });
    await prisma.employmentHistory.deleteMany({
      where: { employeeId: emp.body.id },
    });
    await prisma.employee.delete({ where: { id: emp.body.id } });
  });

  it('position delete is blocked while employees are assigned', async () => {
    await request(app.getHttpServer())
      .delete(`/positions/${positionIds.EXEC}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(409);
  });

  it('audits employment and access changes with position context', async () => {
    const updated = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: subjectEmployeeId, action: 'EMPLOYEE_UPDATED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(updated.newValues).toMatchObject({
      positionId: expect.any(String),
    });
    const sync = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: subjectUserId, action: 'POSITION_ACCESS_SYNCED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(sync.newValues).toMatchObject({
      addedAuto: expect.any(Array),
      preservedManual: expect.any(Array),
    });
    expect(sync.metadata).toMatchObject({ appliedBy: 'POSITION_SYNC' });
    const history = await prisma.employmentHistory.findMany({
      where: { employeeId: subjectEmployeeId },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0]).toMatchObject({ changeType: 'HIRED' });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.notification.deleteMany({
        where: { userId: { in: [...actorUserIds, ...subjectIds] } },
      });
      await prisma.documentAcknowledgement.deleteMany({
        where: { employeeId: subjectEmployeeId },
      });
      await prisma.employeeDocumentVersion.deleteMany({
        where: { employeeDocument: { employeeId: subjectEmployeeId } },
      });
      await prisma.employeeDocument.deleteMany({
        where: { employeeId: subjectEmployeeId },
      });
      await prisma.leaveApproval.deleteMany({
        where: { leaveRequest: { employeeId: subjectEmployeeId } },
      });
      await prisma.leaveRequest.deleteMany({
        where: { employeeId: subjectEmployeeId },
      });
      await prisma.leaveBalance.deleteMany({
        where: { employeeId: subjectEmployeeId },
      });
      await prisma.employeeLeavePolicy.deleteMany({
        where: { employeeId: subjectEmployeeId },
      });
      await prisma.employeeAccessReview.deleteMany({
        where: { employeeId: subjectEmployeeId },
      });
      await prisma.employmentHistory.deleteMany({
        where: { employeeId: subjectEmployeeId },
      });
      await prisma.attendance.deleteMany({
        where: { employeeId: subjectEmployeeId },
      });
      await prisma.employeeShift.deleteMany({
        where: { employeeId: subjectEmployeeId },
      });
      await prisma.employee.deleteMany({
        where: { id: subjectEmployeeId },
      });
      await prisma.positionRoleMapping.deleteMany({
        where: { positionId: { in: positionIdsAll } },
      });
      await prisma.position.deleteMany({
        where: { id: { in: positionIdsAll } },
      });
      await prisma.rolePermission.deleteMany({
        where: {
          permission: {
            code: { in: [`pos.alpha.${suffix}`, `pos.beta.${suffix}`] },
          },
        },
      });
      await prisma.permission.deleteMany({
        where: { code: { in: [`pos.alpha.${suffix}`, `pos.beta.${suffix}`] } },
      });
      await prisma.userRole.deleteMany({
        where: { userId: { in: [...actorUserIds, ...subjectIds] } },
      });
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: [...actorUserIds, ...subjectIds] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [...actorUserIds, ...subjectIds] } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: actorRoleIds } },
      });
      for (const name of ['EMP', 'SALES', 'MGR', 'FIN', 'MKT', 'REP']) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: roleIds[name] },
        });
        await prisma.role.deleteMany({ where: { id: roleIds[name] } });
      }
      await prisma.role.deleteMany({ where: { id: { in: actorRoleIds } } });
    }
    if (app) await app.close();
  });
});
