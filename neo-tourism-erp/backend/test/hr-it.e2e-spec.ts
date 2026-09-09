/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('HR and IT operations (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let staffToken: string;
  let employeeToken: string;
  let staffUserId: string;
  let employeeUserId: string;
  let employeeId: string;
  let extraEmployeeId: string;
  const shiftIds: string[] = [];
  const roleIds: string[] = [];
  const suffix = Date.now();
  const password = 'WorkplaceTest123!';

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
    const permissions = await prisma.permission.findMany({
      where: {
        OR: [{ code: { startsWith: 'hr.' } }, { code: { startsWith: 'it.' } }],
      },
    });
    const staffRole = await prisma.role.create({
      data: {
        name: `HR_IT_TEST_${suffix}`,
        permissions: {
          create: permissions.map((permission) => ({
            permissionId: permission.id,
          })),
        },
      },
    });
    roleIds.push(staffRole.id);
    const selfServiceCodes = new Set([
      'hr.leave.create',
      'hr.leave.view_own',
      'it.ticket.create',
      'it.ticket.view_own',
      'it.access_request.create',
    ]);
    const employeeRole = await prisma.role.create({
      data: {
        name: `EMPLOYEE_SELF_SERVICE_TEST_${suffix}`,
        permissions: {
          create: permissions
            .filter(({ code }) => selfServiceCodes.has(code))
            .map(({ id: permissionId }) => ({ permissionId })),
        },
      },
    });
    roleIds.push(employeeRole.id);
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'IT' },
    });
    const hash = await bcrypt.hash(password, 4);
    const [staff, employee] = await Promise.all([
      prisma.user.create({
        data: {
          email: `it-staff-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'IT',
          lastName: 'Staff',
          departmentId: department.id,
          roles: { create: { roleId: staffRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          email: `employee-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'Test',
          lastName: 'Employee',
          departmentId: department.id,
          roles: { create: { roleId: employeeRole.id } },
        },
      }),
    ]);
    staffUserId = staff.id;
    employeeUserId = employee.id;
    const employeeRecord = await prisma.employee.create({
      data: {
        userId: employee.id,
        employeeNumber: `TEST-EMP-${suffix}`,
        firstName: 'Test',
        lastName: 'Employee',
        jobTitle: 'Tester',
        departmentId: department.id,
        employmentType: 'FULL_TIME',
        joinDate: new Date('2026-01-01'),
      },
    });
    employeeId = employeeRecord.id;
    const login = (email: string) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
    staffToken = (await login(staff.email).expect(200)).body
      .accessToken as string;
    employeeToken = (await login(employee.email).expect(200)).body
      .accessToken as string;
  });

  it('manages employee shifts, status and safe archiving, then tracks attendance', async () => {
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'HR' },
    });
    const [morningShift, eveningShift] = await Promise.all(
      [
        { name: `Morning ${suffix}`, startTime: '09:00', endTime: '17:00' },
        { name: `Evening ${suffix}`, startTime: '14:00', endTime: '22:00' },
      ].map((data) => prisma.shift.create({ data })),
    );
    shiftIds.push(morningShift.id, eveningShift.id);
    const created = await request(app.getHttpServer())
      .post('/hr/employees')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        firstName: 'New',
        lastName: 'Hire',
        jobTitle: 'Coordinator',
        departmentId: department.id,
        employmentType: 'FULL_TIME',
        joinDate: '2026-08-22',
        shiftId: morningShift.id,
      })
      .expect(201);
    expect(created.body.employeeNumber).toMatch(/^NEO-EMP-\d{4,}$/);
    expect(created.body.shifts[0].shift.id).toBe(morningShift.id);
    extraEmployeeId = created.body.id as string;
    const employeeNumber = created.body.employeeNumber as string;
    await request(app.getHttpServer())
      .patch(`/hr/employees/${extraEmployeeId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        jobTitle: 'Senior Coordinator',
        departmentId: department.id,
        shiftId: eveningShift.id,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.employeeNumber).toBe(employeeNumber);
        expect(body.jobTitle).toBe('Senior Coordinator');
        expect(body.shifts[0].shift.id).toBe(eveningShift.id);
      });
    await request(app.getHttpServer())
      .patch(`/hr/employees/${extraEmployeeId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ shiftId: '00000000-0000-4000-8000-000000000001' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/hr/employees/${extraEmployeeId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ jobTitle: 'Unauthorized change' })
      .expect(403);
    const reportPath = '/hr/reports?dateFrom=2026-01-01&dateTo=2026-12-31';
    const activeBefore = (
      await request(app.getHttpServer())
        .get(reportPath)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200)
    ).body.activeHeadcount as number;
    await request(app.getHttpServer())
      .patch(`/hr/employees/${extraEmployeeId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'INACTIVE' })
      .expect(200)
      .expect(({ body }) => expect(body.employmentStatus).toBe('INACTIVE'));
    await request(app.getHttpServer())
      .get(reportPath)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(({ body }) =>
        expect(body.activeHeadcount).toBe(activeBefore - 1),
      );
    await request(app.getHttpServer())
      .patch(`/hr/employees/${extraEmployeeId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'ACTIVE' })
      .expect(200)
      .expect(({ body }) => expect(body.employmentStatus).toBe('ACTIVE'));
    await Promise.all([
      prisma.attendance.create({
        data: {
          employeeId: extraEmployeeId,
          date: new Date('2026-08-22'),
        },
      }),
      prisma.leaveRequest.create({
        data: {
          employeeId: extraEmployeeId,
          leaveType: 'CASUAL',
          startDate: new Date('2026-08-23'),
          endDate: new Date('2026-08-23'),
          reason: 'Archive history test',
        },
      }),
      prisma.employeeDocument.create({
        data: {
          employeeId: extraEmployeeId,
          fileName: 'archive-history.txt',
          fileType: 'text/plain',
          storageKey: `archive-history-${suffix}`,
          category: 'OTHER',
          uploadedById: staffUserId,
        },
      }),
    ]);
    await request(app.getHttpServer())
      .patch(`/hr/employees/${extraEmployeeId}/archive`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.archivedAt).toBeTruthy();
        expect(body.employmentStatus).toBe('INACTIVE');
      });
    await request(app.getHttpServer())
      .get(`/hr/employees?search=${employeeNumber}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(({ body }) => expect(body.data).toHaveLength(0));
    await request(app.getHttpServer())
      .get(`/hr/employees?search=${employeeNumber}&includeArchived=true`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(({ body }) =>
        expect(body.data[0].employeeNumber).toBe(employeeNumber),
      );
    await request(app.getHttpServer())
      .get(reportPath)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(({ body }) =>
        expect(body.activeHeadcount).toBe(activeBefore - 1),
      );
    await expect(
      Promise.all([
        prisma.attendance.count({ where: { employeeId: extraEmployeeId } }),
        prisma.leaveRequest.count({ where: { employeeId: extraEmployeeId } }),
        prisma.employeeDocument.count({
          where: { employeeId: extraEmployeeId },
        }),
      ]),
    ).resolves.toEqual([1, 1, 1]);
    await expect(
      prisma.auditLog.count({
        where: {
          entityId: extraEmployeeId,
          action: {
            in: [
              'EMPLOYEE_CREATED',
              'EMPLOYEE_UPDATED',
              'EMPLOYEE_SHIFT_CHANGED',
              'EMPLOYEE_STATUS_CHANGED',
              'EMPLOYEE_ARCHIVED',
            ],
          },
        },
      }),
    ).resolves.toBeGreaterThanOrEqual(5);
    await request(app.getHttpServer())
      .get(`/hr/employees/${extraEmployeeId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/audit')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
    const attendance = await request(app.getHttpServer())
      .post('/hr/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.state).toBe('WORKING'));
    await request(app.getHttpServer())
      .post('/hr/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(409);
    for (let session = 0; session < 3; session += 1) {
      await request(app.getHttpServer())
        .post('/hr/attendance/break/start')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201)
        .expect(({ body }) => expect(body.state).toBe('ON_BREAK'));
      await request(app.getHttpServer())
        .post('/hr/attendance/break/end')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(201)
        .expect(({ body }) => expect(body.state).toBe('WORKING'));
    }
    await request(app.getHttpServer())
      .post('/hr/attendance/break/start')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(409);
    await request(app.getHttpServer())
      .post('/hr/attendance/check-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post('/hr/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post('/hr/attendance/check-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(201);
    expect(
      await prisma.attendance.count({
        where: { id: attendance.body.id as string },
      }),
    ).toBe(1);
    expect(
      await prisma.attendanceWorkSession.count({
        where: { attendanceId: attendance.body.id as string },
      }),
    ).toBe(2);
    expect(
      await prisma.attendanceBreak.count({
        where: { attendanceId: attendance.body.id as string },
      }),
    ).toBe(3);
  });

  it('submits and approves leave with an audit trail', async () => {
    const leave = await request(app.getHttpServer())
      .post('/hr/leave')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveType: 'UNPAID',
        startDate: '2026-09-10',
        endDate: '2026-09-12',
        reason: 'Family travel',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/hr-approve`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ comment: 'Approved' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('APPROVED'));
    expect(
      await prisma.auditLog.count({
        where: { entityId: leave.body.id, action: 'LEAVE_HR_APPROVED' },
      }),
    ).toBe(1);
  });

  it('creates, assigns and returns a uniquely tagged asset', async () => {
    const asset = await request(app.getHttpServer())
      .post('/it/assets')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        assetType: 'LAPTOP',
        manufacturer: 'Lenovo',
        serialNumber: `SERIAL-${suffix}`,
      })
      .expect(201);
    expect(asset.body.assetTag).toMatch(/^NEO-IT-\d{4,}$/);
    await request(app.getHttpServer())
      .post(`/it/assets/${asset.body.id}/assign`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ employeeId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/it/assets/${asset.body.id}/assign`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ employeeId })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/it/assets/${asset.body.id}/return`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ condition: 'Good' })
      .expect(201);
  });

  it('handles ticket resolution and access approval/fulfilment', async () => {
    const ticket = await request(app.getHttpServer())
      .post('/it/tickets')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        category: 'SOFTWARE',
        priority: 'HIGH',
        subject: 'Application error',
        description: 'The application will not start.',
      })
      .expect(201);
    expect(ticket.body.ticketNumber).toMatch(/^IT-\d{4}-\d{6}$/);
    const otherTicket = await prisma.iTTicket.create({
      data: {
        ticketNumber: `IT-OBJECT-AUTH-${suffix}`,
        requestedByEmployeeId: extraEmployeeId,
        category: 'SOFTWARE',
        subject: 'Private employee ticket',
        description: 'Object authorization regression test.',
      },
    });
    await request(app.getHttpServer())
      .get(`/it/tickets/${otherTicket.id}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/it/tickets/${otherTicket.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/it/tickets/${ticket.body.id}/resolve`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ resolution: 'Reinstalled the application.' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('RESOLVED'));
    const access = await request(app.getHttpServer())
      .post('/it/access-requests')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        systemName: 'Supplier Portal',
        accessType: 'Read only',
        reason: 'Operations duties',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/it/access-requests/${access.body.id}/approve`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/it/access-requests/${access.body.id}/fulfil`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('FULFILLED'));
  });

  afterAll(async () => {
    if (prisma) {
      const employeeIds = [employeeId, extraEmployeeId].filter(Boolean);
      await prisma.notification.deleteMany({
        where: { userId: { in: [staffUserId, employeeUserId] } },
      });
      await prisma.iTTicketActivity.deleteMany({
        where: { ticket: { requestedByEmployeeId: { in: employeeIds } } },
      });
      await prisma.iTTicket.deleteMany({
        where: { requestedByEmployeeId: { in: employeeIds } },
      });
      await prisma.accessRequest.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.assetAssignment.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.iTAsset.deleteMany({
        where: { serialNumber: `SERIAL-${suffix}` },
      });
      await prisma.leaveRequest.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.leaveBalance.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employeeLeavePolicy.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employeeAccessReview.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employeeDocument.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employmentHistory.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.attendance.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employeeShift.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
      await prisma.shift.deleteMany({ where: { id: { in: shiftIds } } });
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: [staffUserId, employeeUserId] } },
      });
      await prisma.userRole.deleteMany({
        where: { userId: { in: [staffUserId, employeeUserId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [staffUserId, employeeUserId] } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    }
    if (app) await app.close();
  });
});
