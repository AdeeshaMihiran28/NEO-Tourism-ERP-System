/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('HR launch requirements (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let hrToken: string;
  let employeeToken: string;
  let viewerToken: string;
  let accessToken: string;
  let hrUserId: string;
  let employeeUserId: string;
  let viewerUserId: string;
  let accessUserId: string;
  let viewerEmployeeId: string;
  let managerEmployeeId: string;
  let noUserEmployeeId: string;
  let employeeId: string;
  let annualPolicyId: string;
  let documentId: string;
  let assetId: string;
  let customFieldId: string;
  const roleIds: string[] = [];
  const suffix = Date.now();
  const password = 'HrLaunchTest123!';

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

    const allPermissions = await prisma.permission.findMany({
      where: {
        OR: [
          { code: { startsWith: 'hr.' } },
          { code: { startsWith: 'it.asset.' } },
        ],
      },
    });
    const hrRole = await prisma.role.create({
      data: {
        name: `HR_LAUNCH_ADMIN_${suffix}`,
        permissions: {
          create: allPermissions.map(({ id: permissionId }) => ({
            permissionId,
          })),
        },
      },
    });
    const selfCodes = [
      'hr.leave.create',
      'hr.leave.view_own',
      'hr.directory.view',
      'hr.org_chart.view',
      'hr.document.view_own',
    ];
    const selfPermissions = allPermissions.filter(({ code }) =>
      selfCodes.includes(code),
    );
    const selfRole = await prisma.role.create({
      data: {
        name: `HR_LAUNCH_EMPLOYEE_${suffix}`,
        permissions: {
          create: selfPermissions.map(({ id: permissionId }) => ({
            permissionId,
          })),
        },
      },
    });
    const viewerCodes = new Set([
      'hr.employee.view',
      'hr.leave.calendar.view',
      'hr.leave.create',
      'hr.leave.view_own',
      'hr.leave.manager_approve',
    ]);
    const viewerRole = await prisma.role.create({
      data: {
        name: `HR_LAUNCH_VIEWER_${suffix}`,
        permissions: {
          create: allPermissions
            .filter(({ code }) => viewerCodes.has(code))
            .map(({ id: permissionId }) => ({ permissionId })),
        },
      },
    });
    const accessPermissions = await prisma.permission.findMany({
      where: { code: { in: ['user.view', 'user.edit'] } },
    });
    const accessRole = await prisma.role.create({
      data: {
        name: `HR_LAUNCH_ACCESS_${suffix}`,
        permissions: {
          create: accessPermissions.map(({ id: permissionId }) => ({
            permissionId,
          })),
        },
      },
    });
    roleIds.push(hrRole.id, selfRole.id, viewerRole.id, accessRole.id);
    const hrDepartment = await prisma.department.findUniqueOrThrow({
      where: { name: 'HR' },
    });
    const hash = await bcrypt.hash(password, 4);
    const hrUser = await prisma.user.create({
      data: {
        email: `hr-launch-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'Launch',
        lastName: 'Manager',
        departmentId: hrDepartment.id,
        roles: { create: { roleId: hrRole.id } },
      },
    });
    const employeeUser = await prisma.user.create({
      data: {
        email: `hr-employee-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'Launch',
        lastName: 'Employee',
        departmentId: hrDepartment.id,
        roles: { create: { roleId: selfRole.id } },
      },
    });
    const viewerUser = await prisma.user.create({
      data: {
        email: `hr-viewer-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'HR',
        lastName: 'Viewer',
        departmentId: hrDepartment.id,
        roles: { create: { roleId: viewerRole.id } },
      },
    });
    const accessUser = await prisma.user.create({
      data: {
        email: `hr-access-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'Access',
        lastName: 'Administrator',
        departmentId: hrDepartment.id,
        roles: { create: { roleId: accessRole.id } },
      },
    });
    hrUserId = hrUser.id;
    employeeUserId = employeeUser.id;
    viewerUserId = viewerUser.id;
    accessUserId = accessUser.id;
    const viewerEmployee = await prisma.employee.create({
      data: {
        userId: viewerUser.id,
        employeeNumber: `HR-VIEWER-${suffix}`,
        firstName: 'HR',
        lastName: 'Viewer',
        workEmail: viewerUser.email,
        jobTitle: 'Team Manager',
        departmentId: hrDepartment.id,
        employmentType: 'FULL_TIME',
        joinDate: new Date('2024-01-01'),
      },
    });
    viewerEmployeeId = viewerEmployee.id;
    const manager = await prisma.employee.create({
      data: {
        userId: hrUser.id,
        employeeNumber: `HR-MANAGER-${suffix}`,
        firstName: 'Launch',
        lastName: 'Manager',
        workEmail: hrUser.email,
        jobTitle: 'HR Manager',
        departmentId: hrDepartment.id,
        employmentType: 'FULL_TIME',
        joinDate: new Date('2024-01-01'),
      },
    });
    managerEmployeeId = manager.id;
    const noUserEmployee = await prisma.employee.create({
      data: {
        employeeNumber: `HR-NO-USER-${suffix}`,
        firstName: 'No Account',
        lastName: 'Employee',
        jobTitle: 'Temporary Employee',
        departmentId: hrDepartment.id,
        employmentType: 'TEMPORARY',
        joinDate: new Date('2025-01-01'),
      },
    });
    noUserEmployeeId = noUserEmployee.id;
    const employee = await prisma.employee.create({
      data: {
        userId: employeeUser.id,
        employeeNumber: `HR-EMPLOYEE-${suffix}`,
        firstName: 'Launch',
        lastName: 'Employee',
        workEmail: employeeUser.email,
        workPhone: '+94 11 555 0100',
        phone: '+94 77 555 0100',
        personalEmail: `private-${suffix}@personal.test`,
        address: 'Private address',
        jobTitle: 'HR Coordinator',
        departmentId: hrDepartment.id,
        managerId: manager.id,
        employmentType: 'FULL_TIME',
        joinDate: new Date('2025-01-01'),
      },
    });
    employeeId = employee.id;
    const annualPolicy = await prisma.leavePolicy.findFirstOrThrow({
      where: { leaveType: 'ANNUAL', isActive: true },
    });
    annualPolicyId = annualPolicy.id;
    await prisma.employeeLeavePolicy.create({
      data: {
        employeeId,
        leavePolicyId: annualPolicy.id,
        effectiveFrom: new Date('2025-01-01'),
      },
    });
    await prisma.leaveBalance.create({
      data: {
        employeeId,
        leaveType: 'ANNUAL',
        year: 2027,
        openingBalance: 14,
        remainingBalance: 14,
      },
    });
    const login = (email: string) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
    hrToken = (await login(hrUser.email).expect(200)).body
      .accessToken as string;
    employeeToken = (await login(employeeUser.email).expect(200)).body
      .accessToken as string;
    viewerToken = (await login(viewerUser.email).expect(200)).body
      .accessToken as string;
    accessToken = (await login(accessUser.email).expect(200)).body
      .accessToken as string;
  });

  it('enforces safe directory and employee self-service fields', async () => {
    const directory = await request(app.getHttpServer())
      .get('/hr/directory')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    const directoryItems = directory.body as Array<{
      id: string;
      workEmail?: string;
      workPhone?: string;
      phone?: string;
      personalEmail?: string;
      address?: string;
    }>;
    const own = directoryItems.find(
      (item: { id: string }) => item.id === employeeId,
    )!;
    expect(own.workEmail).toContain('@test.local');
    expect(own.workPhone).toBe('+94 11 555 0100');
    expect(own.phone).toBeUndefined();
    expect(own.personalEmail).toBeUndefined();
    expect(own.address).toBeUndefined();
    const limitedDetail = await request(app.getHttpServer())
      .get(`/hr/employees/${employeeId}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    expect(limitedDetail.body.phone).toBeUndefined();
    expect(limitedDetail.body.personalEmail).toBeUndefined();
    expect(limitedDetail.body.address).toBeUndefined();
    await request(app.getHttpServer())
      .get(`/hr/employees/${managerEmployeeId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch('/hr/me')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        phone: '+94 77 123 4567',
        personalEmail: `updated-${suffix}@personal.test`,
      })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/hr/me')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        departmentId: (
          await prisma.department.findUniqueOrThrow({
            where: { name: 'Accounts' },
          })
        ).id,
      })
      .expect(400);
  });

  it('creates employment history/access review and prevents circular managers', async () => {
    const accounts = await prisma.department.findUniqueOrThrow({
      where: { name: 'Accounts' },
    });
    await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        departmentId: accounts.id,
        jobTitle: 'Accounts Coordinator',
        changeReason: 'Approved transfer',
      })
      .expect(200);
    const history = await request(app.getHttpServer())
      .get(`/hr/employees/${employeeId}/employment-history`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    const historyItems = history.body as Array<{ changeType: string }>;
    expect(
      historyItems.some(
        (item: { changeType: string }) =>
          item.changeType === 'DEPARTMENT_CHANGE',
      ),
    ).toBe(true);
    expect(
      await prisma.employeeAccessReview.count({
        where: { employeeId, triggerType: 'DEPARTMENT_CHANGE' },
      }),
    ).toBe(1);
    await request(app.getHttpServer())
      .patch(`/hr/employees/${managerEmployeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ managerId: employeeId, changeReason: 'Invalid cycle' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ managerId: employeeId, changeReason: 'Invalid self manager' })
      .expect(400);
    const chart = await request(app.getHttpServer())
      .get('/hr/org-chart')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(JSON.stringify(chart.body)).toContain(`HR-EMPLOYEE-${suffix}`);
  });

  it('supports custom fields and all-or-nothing CSV validation', async () => {
    const field = await request(app.getHttpServer())
      .post('/hr/custom-fields')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        name: 'Uniform Size',
        code: `uniform_size_${suffix}`,
        fieldType: 'SELECT',
        selectOptions: ['S', 'M', 'L'],
      })
      .expect(201);
    customFieldId = field.body.id as string;
    await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeId}/custom-fields/${customFieldId}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ value: { selected: 'M' } })
      .expect(200);
    const invalidCsv =
      'firstName,lastName,jobTitle,department,employmentType,employmentStatus,joinDate,workEmail\nBad,Row,Agent,Missing,FULL_TIME,ACTIVE,2026-01-01,not-an-email';
    const imported = await request(app.getHttpServer())
      .post('/hr/employees/import')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ csv: invalidCsv })
      .expect(201);
    expect(imported.body.successful).toBe(0);
    expect(imported.body.failed).toBe(1);
    await request(app.getHttpServer())
      .get('/hr/employees/export')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect('Content-Type', /text\/csv/)
      .expect(200);
  });

  it('deducts and restores leave through manager and HR approval', async () => {
    const attendance = await request(app.getHttpServer())
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
    await request(app.getHttpServer())
      .post('/hr/attendance/check-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/hr/attendance/${attendance.body.id}`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        checkInAt: '2026-09-07T10:00:00.000Z',
        checkOutAt: '2026-09-07T09:00:00.000Z',
      })
      .expect(400);
    const leave = await request(app.getHttpServer())
      .post('/hr/leave')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveType: 'ANNUAL',
        startDate: '2027-02-10',
        endDate: '2027-02-11',
        reason: 'Planned leave',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/hr/leave')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveType: 'ANNUAL',
        startDate: '2027-02-11',
        endDate: '2027-02-12',
        reason: 'Overlapping leave',
      })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/hr-approve`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'Attempted early HR approval' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/approve`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ notes: 'Attempted legacy approval bypass' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/manager-approve`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'Manager approved' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('PENDING'));
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/manager-approve`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'Duplicate manager approval' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/hr-approve`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'HR approved' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('APPROVED'));
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/hr-approve`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'Duplicate HR approval' })
      .expect(409);
    await request(app.getHttpServer())
      .get('/hr/leave/calendar?dateFrom=2027-02-01&dateTo=2027-02-28')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          (body as Array<{ id: string }>).some(
            ({ id }) => id === leave.body.id,
          ),
        ).toBe(false),
      );
    expect(
      (
        await prisma.leaveBalance.findUniqueOrThrow({
          where: {
            employeeId_leaveType_year: {
              employeeId,
              leaveType: 'ANNUAL',
              year: 2027,
            },
          },
        })
      ).remainingBalance.toString(),
    ).toBe('12');
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/cancel`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/cancel`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(409);
    expect(
      (
        await prisma.leaveBalance.findUniqueOrThrow({
          where: {
            employeeId_leaveType_year: {
              employeeId,
              leaveType: 'ANNUAL',
              year: 2027,
            },
          },
        })
      ).remainingBalance.toString(),
    ).toBe('14');
  });

  it('enforces manager scope and records a manager rejection reason', async () => {
    const leave = await request(app.getHttpServer())
      .post('/hr/leave')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveType: 'ANNUAL',
        startDate: '2027-03-10',
        endDate: '2027-03-11',
        reason: 'Family event',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/manager-approve`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/manager-approve`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/manager-reject`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ reason: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/manager-reject`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ reason: 'Insufficient staffing' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('REJECTED');
        expect(body.approvals).toHaveLength(1);
        expect(body.approvals[0]).toMatchObject({
          approvalLevel: 'MANAGER',
          status: 'REJECTED',
          comment: 'Insufficient staffing',
          approverUserId: hrUserId,
        });
        expect(body.approvals[0].reviewedAt).toBeTruthy();
      });
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/manager-reject`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ reason: 'Duplicate rejection' })
      .expect(409);
    expect(
      await prisma.auditLog.count({
        where: { entityId: leave.body.id, action: 'LEAVE_MANAGER_REJECTED' },
      }),
    ).toBe(1);
    expect(
      (
        await prisma.leaveBalance.findUniqueOrThrow({
          where: {
            employeeId_leaveType_year: {
              employeeId,
              leaveType: 'ANNUAL',
              year: 2027,
            },
          },
        })
      ).remainingBalance.toString(),
    ).toBe('14');
  });

  it('records HR rejection after manager approval without deducting balance', async () => {
    const leave = await request(app.getHttpServer())
      .post('/hr/leave')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveType: 'ANNUAL',
        startDate: '2027-04-10',
        endDate: '2027-04-11',
        reason: 'Personal event',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/hr-reject`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ reason: 'Attempted early review' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/manager-approve`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'Manager approved' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/hr-reject`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/hr-reject`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ reason: 'Peak operational period' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('REJECTED');
        expect(body.approvals).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              approvalLevel: 'MANAGER',
              status: 'APPROVED',
            }),
            expect.objectContaining({
              approvalLevel: 'HR',
              status: 'REJECTED',
              comment: 'Peak operational period',
              approverUserId: hrUserId,
            }),
          ]),
        );
      });
    expect(
      (
        await prisma.leaveBalance.findUniqueOrThrow({
          where: {
            employeeId_leaveType_year: {
              employeeId,
              leaveType: 'ANNUAL',
              year: 2027,
            },
          },
        })
      ).remainingBalance.toString(),
    ).toBe('14');
  });

  it('routes an employee without a manager directly to HR', async () => {
    const leave = await request(app.getHttpServer())
      .post('/hr/leave')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        leaveType: 'UNPAID',
        startDate: '2027-06-10',
        endDate: '2027-06-11',
        reason: 'Personal leave',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('PENDING');
        expect(body.approvals).toHaveLength(1);
        expect(body.approvals[0]).toMatchObject({
          approvalLevel: 'HR',
          status: 'PENDING',
        });
      });
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/hr-approve`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'HR approved' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('APPROVED'));
    await request(app.getHttpServer())
      .get('/hr/leave/calendar?dateFrom=2027-06-01&dateTo=2027-06-30')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          (body as Array<{ id: string }>).some(
            ({ id }) => id === leave.body.id,
          ),
        ).toBe(true),
      );
  });

  it('rejects insufficient and cross-year leave and cancels pending leave safely', async () => {
    await request(app.getHttpServer())
      .post('/hr/leave')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveType: 'ANNUAL',
        startDate: '2027-05-01',
        endDate: '2027-05-15',
        reason: 'Exceeds balance',
      })
      .expect(409)
      .expect(({ body }) =>
        expect(body.message).toBe('Insufficient Annual leave balance.'),
      );
    await request(app.getHttpServer())
      .post('/hr/leave')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveType: 'ANNUAL',
        startDate: '2027-12-31',
        endDate: '2028-01-01',
        reason: 'Cross-year leave',
      })
      .expect(400);
    const leave = await request(app.getHttpServer())
      .post('/hr/leave')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        leaveType: 'ANNUAL',
        startDate: '2027-07-10',
        endDate: '2027-07-10',
        reason: 'Pending cancellation',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/hr/leave/${leave.body.id}/cancel`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('CANCELLED'));
    expect(
      (
        await prisma.leaveBalance.findUniqueOrThrow({
          where: {
            employeeId_leaveType_year: {
              employeeId,
              leaveType: 'ANNUAL',
              year: 2027,
            },
          },
        })
      ).remainingBalance.toString(),
    ).toBe('14');
  });

  it('tracks onboarding documents, reports, and asset-gated access revocation', async () => {
    await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeId}/onboarding`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ status: 'COMPLETED' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/hr/employees/${employeeId}/onboarding/start`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/hr/employees/${employeeId}/onboarding/start`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({})
      .expect(409);
    const tasks = await request(app.getHttpServer())
      .get(`/hr/employees/${employeeId}/onboarding/tasks`)
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200);
    const document = await request(app.getHttpServer())
      .post(`/hr/employees/${employeeId}/documents`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        fileName: 'Policy.pdf',
        fileType: 'application/pdf',
        storageKey: `test/${suffix}/policy.pdf`,
        category: 'POLICY',
        visibility: 'EMPLOYEE',
      })
      .expect(201);
    documentId = document.body.id as string;
    const restricted = await request(app.getHttpServer())
      .post(`/hr/employees/${employeeId}/documents`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({
        fileName: 'Restricted.pdf',
        fileType: 'application/pdf',
        storageKey: `test/${suffix}/restricted.pdf`,
        category: 'OTHER',
        visibility: 'HR_ONLY',
      })
      .expect(201);
    const ownDocuments = await request(app.getHttpServer())
      .get('/hr/documents/my')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(
      (ownDocuments.body as Array<{ id: string }>).some(
        ({ id }) => id === restricted.body.id,
      ),
    ).toBe(false);
    for (const task of tasks.body as Array<{
      id: string;
      requiresDocument: boolean;
    }>) {
      await request(app.getHttpServer())
        .patch(`/hr/onboarding/tasks/${task.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          status: 'COMPLETED',
          ...(task.requiresDocument && { employeeDocumentId: documentId }),
        })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post(`/hr/documents/${documentId}/acknowledge`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ typedName: 'Launch Employee' })
      .expect(201)
      .expect(({ body }) =>
        expect(body.disclaimer).toContain('not a certified'),
      );
    await request(app.getHttpServer())
      .get('/hr/reports?dateFrom=2026-01-01&dateTo=2027-12-31')
      .set('Authorization', `Bearer ${hrToken}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.turnoverDefinition).toContain('average'),
      );

    const asset = await request(app.getHttpServer())
      .post('/it/assets')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ assetType: 'LAPTOP', serialNumber: `HR-LAUNCH-${suffix}` })
      .expect(201);
    assetId = asset.body.id as string;
    await request(app.getHttpServer())
      .patch(`/hr/employees/${employeeId}/offboarding`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ status: 'COMPLETED', erpAccountDisabled: true })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/it/assets/${assetId}/assign`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ employeeId })
      .expect(201);
    const offboarding = await request(app.getHttpServer())
      .post(`/hr/employees/${employeeId}/offboarding/start`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ effectiveDate: '2027-12-31' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/hr/employees/${employeeId}/offboarding/start`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ effectiveDate: '2027-12-31' })
      .expect(409);
    const rolesBeforeOffboarding = await prisma.userRole.count({
      where: { userId: employeeUserId },
    });
    for (const task of offboarding.body as Array<{
      id: string;
      category: string;
    }>) {
      if (task.category === 'ACCESS') continue;
      await request(app.getHttpServer())
        .patch(`/hr/offboarding/tasks/${task.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post(`/hr/employees/${employeeId}/offboarding/complete`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'Attempt with asset outstanding' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/it/assets/${assetId}/return`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ condition: 'Good' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/hr/employees/${employeeId}/offboarding/complete`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'Authorized completion' })
      .expect(201)
      .expect(({ body }) => expect(body.employmentStatus).toBe('TERMINATED'));
    await request(app.getHttpServer())
      .get('/hr/me')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    const users = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      (users.body as Array<{ id: string; accessMismatch: boolean }>).find(
        ({ id }) => id === employeeUserId,
      ),
    ).toMatchObject({ accessMismatch: true });
    expect(
      await prisma.userRole.count({ where: { userId: employeeUserId } }),
    ).toBe(rolesBeforeOffboarding);
    await expect(
      prisma.auditLog.count({
        where: {
          entityId: employeeId,
          action: 'ERP_ACCESS_DISABLE_REQUIRED',
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.notification.count({
        where: {
          userId: accessUserId,
          entityType: 'User',
          entityId: employeeUserId,
        },
      }),
    ).resolves.toBe(1);
    await request(app.getHttpServer())
      .post(`/hr/employees/${employeeId}/offboarding/complete`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'Duplicate completion' })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/users/${employeeUserId}/status`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ isActive: false })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${employeeUserId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false })
      .expect(200);
    const disableAudits = await prisma.auditLog.count({
      where: { entityId: employeeUserId, action: 'USER_ACCESS_DISABLED' },
    });
    await request(app.getHttpServer())
      .patch(`/users/${employeeUserId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: { entityId: employeeUserId, action: 'USER_ACCESS_DISABLED' },
      }),
    ).toBe(disableAudits);
    await request(app.getHttpServer())
      .get('/hr/me')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `hr-employee-${suffix}@test.local`, password })
      .expect(401);
    await expect(
      prisma.employee.findUnique({ where: { id: employeeId } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.user.findUnique({ where: { id: employeeUserId } }),
    ).resolves.toMatchObject({ isActive: false });
    await expect(
      prisma.employee.findUnique({ where: { id: employeeId } }),
    ).resolves.toMatchObject({ erpAccountDisabled: true });
    expect(
      await prisma.userRole.count({ where: { userId: employeeUserId } }),
    ).toBe(rolesBeforeOffboarding);
    await expect(
      prisma.offboardingTask.count({
        where: {
          employeeId,
          category: 'ACCESS',
          status: 'COMPLETED',
          completedById: accessUserId,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          entityType: 'Employee',
          entityId: employeeId,
          action: 'OFFBOARDING_COMPLETED',
        },
      }),
    ).resolves.toBe(1);
    expect(
      await prisma.auditLog.count({ where: { actorId: employeeUserId } }),
    ).toBeGreaterThan(0);
  });

  it('offboards an employee without an ERP user without access work', async () => {
    const started = await request(app.getHttpServer())
      .post(`/hr/employees/${noUserEmployeeId}/offboarding/start`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ effectiveDate: '2027-12-31' })
      .expect(201);
    expect(
      (started.body as Array<{ category: string }>).some(
        ({ category }) => category === 'ACCESS',
      ),
    ).toBe(false);
    for (const task of started.body as Array<{ id: string }>) {
      await request(app.getHttpServer())
        .patch(`/hr/offboarding/tasks/${task.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post(`/hr/employees/${noUserEmployeeId}/offboarding/complete`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'No ERP account' })
      .expect(201);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: noUserEmployeeId,
          action: 'ERP_ACCESS_DISABLE_REQUIRED',
        },
      }),
    ).toBe(0);
  });

  it('creates no access work when the linked user is already disabled', async () => {
    await request(app.getHttpServer())
      .patch(`/users/${viewerUserId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ isActive: false })
      .expect(200);
    const started = await request(app.getHttpServer())
      .post(`/hr/employees/${viewerEmployeeId}/offboarding/start`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ effectiveDate: '2027-12-31' })
      .expect(201);
    expect(
      (started.body as Array<{ category: string }>).some(
        ({ category }) => category === 'ACCESS',
      ),
    ).toBe(false);
    for (const task of started.body as Array<{ id: string }>) {
      await request(app.getHttpServer())
        .patch(`/hr/offboarding/tasks/${task.id}`)
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post(`/hr/employees/${viewerEmployeeId}/offboarding/complete`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'ERP access already disabled' })
      .expect(201);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: viewerEmployeeId,
          action: 'ERP_ACCESS_DISABLE_REQUIRED',
        },
      }),
    ).toBe(0);
  });

  afterAll(async () => {
    if (prisma) {
      const employeeIds = [
        employeeId,
        managerEmployeeId,
        noUserEmployeeId,
        viewerEmployeeId,
      ].filter(Boolean);
      await prisma.notification.deleteMany({
        where: {
          userId: {
            in: [hrUserId, employeeUserId, viewerUserId, accessUserId],
          },
        },
      });
      await prisma.documentAcknowledgement.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employeeDocumentVersion.deleteMany({
        where: { employeeDocument: { employeeId: { in: employeeIds } } },
      });
      await prisma.onboardingTask.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.offboardingTask.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employeeCustomFieldValue.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      if (customFieldId)
        await prisma.employeeCustomFieldDefinition.deleteMany({
          where: { id: customFieldId },
        });
      await prisma.employeeDocument.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.leaveApproval.deleteMany({
        where: { leaveRequest: { employeeId: { in: employeeIds } } },
      });
      await prisma.leaveRequest.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.leaveBalance.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employeeLeavePolicy.deleteMany({
        where: {
          employeeId: { in: employeeIds },
          leavePolicyId: annualPolicyId,
        },
      });
      await prisma.employeeAccessReview.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employmentHistory.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.assetAssignment.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      if (assetId) await prisma.iTAsset.deleteMany({ where: { id: assetId } });
      await prisma.attendance.deleteMany({
        where: { employeeId: { in: employeeIds } },
      });
      await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
      await prisma.auditLog.deleteMany({
        where: {
          actorId: {
            in: [hrUserId, employeeUserId, viewerUserId, accessUserId],
          },
        },
      });
      await prisma.userRole.deleteMany({
        where: {
          userId: {
            in: [hrUserId, employeeUserId, viewerUserId, accessUserId],
          },
        },
      });
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [hrUserId, employeeUserId, viewerUserId, accessUserId],
          },
        },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    }
    if (app) await app.close();
  });
});
