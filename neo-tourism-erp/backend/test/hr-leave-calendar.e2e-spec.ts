/* Shared leave calendar: approved-only safe projection for all employees. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Shared leave calendar (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let mateId: string;
  let cancellableId: string;
  const roleIds: string[] = [];
  const userIds: string[] = [];
  const employeeIds: string[] = [];
  const suffix = Date.now();

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

    const viewOwn = await prisma.permission.findUniqueOrThrow({
      where: { code: 'hr.leave.view_own' },
    });
    const role = await prisma.role.create({
      data: {
        name: `SHARED_CAL_EMPLOYEE_${suffix}`,
        permissions: { create: { permissionId: viewOwn.id } },
      },
    });
    roleIds.push(role.id);
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'HR' },
    });
    const hash = await bcrypt.hash('SharedCal123!', 4);
    const viewer = await prisma.user.create({
      data: {
        email: `shared-viewer-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'Shared',
        lastName: 'Viewer',
        departmentId: department.id,
        roles: { create: { roleId: role.id } },
      },
    });
    userIds.push(viewer.id);
    const self = await prisma.employee.create({
      data: {
        userId: viewer.id,
        employeeNumber: `SHARED-SELF-${suffix}`,
        firstName: 'Shared',
        lastName: 'Viewer',
        jobTitle: 'Tester',
        departmentId: department.id,
        employmentType: 'FULL_TIME',
        joinDate: new Date('2025-01-01'),
      },
    });
    const mate = await prisma.employee.create({
      data: {
        employeeNumber: `SHARED-MATE-${suffix}`,
        firstName: 'Mate',
        lastName: 'Onleave',
        jobTitle: 'Tester',
        departmentId: department.id,
        employmentType: 'FULL_TIME',
        joinDate: new Date('2025-01-01'),
      },
    });
    employeeIds.push(self.id, mate.id);
    mateId = mate.id;
    const mk = (
      leaveType: 'ANNUAL' | 'SICK' | 'CASUAL' | 'UNPAID',
      startDate: string,
      endDate: string,
      reason: string,
      status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'CANCELLED',
    ) =>
      prisma.leaveRequest.create({
        data: {
          employeeId: mate.id,
          leaveType,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          reason,
          status,
        },
      });
    await mk(
      'ANNUAL',
      '2026-10-12',
      '2026-10-14',
      'Medical treatment — private',
      'APPROVED',
    );
    await mk('SICK', '2026-10-15', '2026-10-15', 'Pending reason', 'PENDING');
    await mk(
      'CASUAL',
      '2026-10-16',
      '2026-10-16',
      'Rejected reason',
      'REJECTED',
    );
    await mk(
      'UNPAID',
      '2026-10-17',
      '2026-10-17',
      'Cancelled reason',
      'CANCELLED',
    );
    cancellableId = (
      await mk(
        'ANNUAL',
        '2026-10-20',
        '2026-10-21',
        'Later cancelled',
        'APPROVED',
      )
    ).id;
    token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: viewer.email, password: 'SharedCal123!' })
        .expect(200)
    ).body.accessToken as string;
  });

  const october =
    '/hr/leave/calendar/shared?dateFrom=2026-10-01&dateTo=2026-10-31';

  it('A: shows approved leave with safe fields only', async () => {
    const res = await request(app.getHttpServer())
      .get(october)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({
      leaveType: 'ANNUAL',
      employee: { firstName: 'Mate', lastName: 'Onleave' },
    });
    expect(res.body[0].employee.department.name).toBe('HR');
  });

  it('B/C/D: hides pending, rejected and cancelled leave', async () => {
    const res = await request(app.getHttpServer())
      .get(october)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const types = (res.body as Array<{ leaveType: string }>).map(
      ({ leaveType }) => leaveType,
    );
    expect(types).not.toContain('SICK');
    expect(types).not.toContain('CASUAL');
    expect(types).not.toContain('UNPAID');
  });

  it('E: never exposes the private leave reason', async () => {
    const res = await request(app.getHttpServer())
      .get(october)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body[0].reason).toBeUndefined();
    expect(res.body[0].reviewNotes).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('Medical treatment');
  });

  it('F: cancelled approved leave disappears automatically', async () => {
    const before = await request(app.getHttpServer())
      .get(october)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (before.body as Array<{ id: string }>).some(
        ({ id }) => id === cancellableId,
      ),
    ).toBe(true);
    await prisma.leaveRequest.update({
      where: { id: cancellableId },
      data: { status: 'CANCELLED' },
    });
    const after = await request(app.getHttpServer())
      .get(october)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      (after.body as Array<{ id: string }>).some(
        ({ id }) => id === cancellableId,
      ),
    ).toBe(false);
  });

  it('G: blocks unauthenticated callers', async () => {
    await request(app.getHttpServer()).get(october).expect(401);
  });

  it('H: rejects query manipulation and invalid dates', async () => {
    await request(app.getHttpServer())
      .get(`${october}&status=PENDING`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/hr/leave/calendar/shared?dateFrom=not-a-date&dateTo=2026-10-31')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('supports department, employee and leave-type filters', async () => {
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'HR' },
    });
    const byDept = await request(app.getHttpServer())
      .get(`${october}&departmentId=${department.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((byDept.body as unknown[]).length).toBeGreaterThan(0);
    const byType = await request(app.getHttpServer())
      .get(`${october}&leaveType=SICK`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byType.body).toHaveLength(0);
    const byEmployee = await request(app.getHttpServer())
      .get(`${october}&employeeId=${mateId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((byEmployee.body as unknown[]).length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.leaveRequest.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employee.deleteMany({
        where: { id: { in: employeeIds } },
      });
      await prisma.userRole.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    }
    if (app) await app.close();
  });
});
