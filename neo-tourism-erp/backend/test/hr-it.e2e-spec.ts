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
  let roleId: string;
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
    const role = await prisma.role.create({
      data: {
        name: `HR_IT_TEST_${suffix}`,
        permissions: {
          create: permissions.map((permission) => ({
            permissionId: permission.id,
          })),
        },
      },
    });
    roleId = role.id;
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
          roles: { create: { roleId } },
        },
      }),
      prisma.user.create({
        data: {
          email: `employee-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'Test',
          lastName: 'Employee',
          departmentId: department.id,
          roles: { create: { roleId } },
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

  it('creates numbered employees and protects duplicate attendance', async () => {
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'HR' },
    });
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
      })
      .expect(201);
    expect(created.body.employeeNumber).toMatch(/^NEO-EMP-\d{4,}$/);
    extraEmployeeId = created.body.id as string;
    await request(app.getHttpServer())
      .post('/hr/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post('/hr/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(409);
    await request(app.getHttpServer())
      .post('/hr/attendance/check-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(201);
  });

  it('submits and approves leave with an audit trail', async () => {
    const leave = await request(app.getHttpServer())
      .post('/hr/leave')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveType: 'ANNUAL',
        startDate: '2026-09-10',
        endDate: '2026-09-12',
        reason: 'Family travel',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/approve`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ notes: 'Approved' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('APPROVED'));
    expect(
      await prisma.auditLog.count({
        where: { entityId: leave.body.id, action: 'LEAVE_APPROVED' },
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
      await prisma.attendance.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: [staffUserId, employeeUserId] } },
      });
      await prisma.userRole.deleteMany({
        where: { userId: { in: [staffUserId, employeeUserId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [staffUserId, employeeUserId] } },
      });
      await prisma.rolePermission.deleteMany({ where: { roleId } });
      await prisma.role.delete({ where: { id: roleId } });
    }
    if (app) await app.close();
  });
});
