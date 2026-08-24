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
  let hrUserId: string;
  let employeeUserId: string;
  let managerEmployeeId: string;
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
    roleIds.push(hrRole.id, selfRole.id);
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
    hrUserId = hrUser.id;
    employeeUserId = employeeUser.id;
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
      .post(`/hr/leave/${leave.body.id}/hr-approve`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ comment: 'HR approved' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('APPROVED'));
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
      .post(`/hr/employees/${employeeId}/onboarding/start`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({})
      .expect(201);
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
      .post(`/it/assets/${assetId}/assign`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ employeeId })
      .expect(201);
    const offboarding = await request(app.getHttpServer())
      .post(`/hr/employees/${employeeId}/offboarding/start`)
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ effectiveDate: '2027-12-31' })
      .expect(201);
    for (const task of offboarding.body as Array<{ id: string }>) {
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
      .post('/auth/login')
      .send({ email: `hr-employee-${suffix}@test.local`, password })
      .expect(401);
    expect(
      await prisma.auditLog.count({ where: { actorId: employeeUserId } }),
    ).toBeGreaterThan(0);
  });

  afterAll(async () => {
    if (prisma) {
      const employeeIds = [employeeId, managerEmployeeId].filter(Boolean);
      await prisma.notification.deleteMany({
        where: { userId: { in: [hrUserId, employeeUserId] } },
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
        where: { actorId: { in: [hrUserId, employeeUserId] } },
      });
      await prisma.userRole.deleteMany({
        where: { userId: { in: [hrUserId, employeeUserId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [hrUserId, employeeUserId] } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    }
    if (app) await app.close();
  });
});
