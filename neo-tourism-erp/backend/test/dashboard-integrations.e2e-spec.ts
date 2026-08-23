/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { LeadStatus } from '../generated/prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Management dashboard and integration foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let managementToken: string;
  let limitedToken: string;
  let unauthorizedToken: string;
  let managementUserId: string;
  let limitedUserId: string;
  let unauthorizedUserId: string;
  let managementRoleId: string;
  let limitedRoleId: string;
  let unauthorizedRoleId: string;
  let baselineCustomerId: string;
  let baselineLeadId: string;
  const suffix = Date.now();
  const password = 'DashboardTest123!';
  const originalEnv = {
    website: process.env.WEBSITE_WEBHOOK_SECRET,
    wise: process.env.WISE_API_TOKEN,
    pbxUrl: process.env.PBX_API_URL,
    pbxToken: process.env.PBX_API_TOKEN,
    systemUser: process.env.INTEGRATION_SYSTEM_USER_EMAIL,
  };

  beforeAll(async () => {
    process.env.WEBSITE_WEBHOOK_SECRET = `website-secret-${suffix}`;
    delete process.env.WISE_API_TOKEN;
    delete process.env.PBX_API_URL;
    delete process.env.PBX_API_TOKEN;
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
    const codes = [
      'dashboard.management.view',
      'dashboard.sales.view',
      'dashboard.operations.view',
      'dashboard.accounts.view',
      'dashboard.hr.view',
      'dashboard.it.view',
      'finance.view',
      'integration.view',
      'integration.manage',
      'lead.view',
    ];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: codes } },
    });
    const permissionId = (code: string) =>
      permissions.find((permission) => permission.code === code)!.id;
    const [managementRole, limitedRole, unauthorizedRole] = await Promise.all([
      prisma.role.create({
        data: {
          name: `MANAGEMENT_DASH_TEST_${suffix}`,
          permissions: {
            create: codes.map((code) => ({ permissionId: permissionId(code) })),
          },
        },
      }),
      prisma.role.create({
        data: {
          name: `LIMITED_DASH_TEST_${suffix}`,
          permissions: {
            create: { permissionId: permissionId('dashboard.management.view') },
          },
        },
      }),
      prisma.role.create({ data: { name: `NO_DASH_TEST_${suffix}` } }),
    ]);
    managementRoleId = managementRole.id;
    limitedRoleId = limitedRole.id;
    unauthorizedRoleId = unauthorizedRole.id;
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'Management' },
    });
    const hash = await bcrypt.hash(password, 4);
    const [management, limited, unauthorized] = await Promise.all([
      prisma.user.create({
        data: {
          email: `management-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'Management',
          lastName: 'Tester',
          departmentId: department.id,
          roles: { create: { roleId: managementRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          email: `limited-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'Limited',
          lastName: 'Manager',
          departmentId: department.id,
          roles: { create: { roleId: limitedRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          email: `unauthorized-${suffix}@test.local`,
          passwordHash: hash,
          firstName: 'No',
          lastName: 'Dashboard',
          departmentId: department.id,
          roles: { create: { roleId: unauthorizedRole.id } },
        },
      }),
    ]);
    managementUserId = management.id;
    limitedUserId = limited.id;
    unauthorizedUserId = unauthorized.id;
    process.env.INTEGRATION_SYSTEM_USER_EMAIL = management.email;
    const customer = await prisma.customer.create({
      data: {
        firstName: 'Existing',
        lastName: 'Website Customer',
        email: `existing-web-${suffix}@test.local`,
        phone: `+9477${String(suffix).slice(-7)}`,
        createdById: management.id,
        updatedById: management.id,
      },
    });
    baselineCustomerId = customer.id;
    const lead = await prisma.lead.create({
      data: {
        customerId: customer.id,
        status: LeadStatus.QUOTING,
        isAttentionRequired: true,
        attentionSince: new Date(),
        source: 'TEST',
        destination: 'Paris',
        createdById: management.id,
        createdAt: new Date('2026-08-23T08:00:00.000Z'),
      },
    });
    baselineLeadId = lead.id;
    const login = (email: string) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
    managementToken = (await login(management.email).expect(200)).body
      .accessToken as string;
    limitedToken = (await login(limited.email).expect(200)).body
      .accessToken as string;
    unauthorizedToken = (await login(unauthorized.email).expect(200)).body
      .accessToken as string;
  });

  it('authorizes management, rejects unauthorized users, and hides finance fields without finance permission', async () => {
    const full = await request(app.getHttpServer())
      .get('/dashboard/management')
      .set('Authorization', `Bearer ${managementToken}`)
      .expect(200);
    expect(full.body).toEqual(
      expect.objectContaining({
        sales: expect.any(Object),
        operations: expect.any(Object),
        accounts: expect.any(Object),
        hr: expect.any(Object),
        it: expect.any(Object),
      }),
    );
    expect(full.body.accounts).toHaveProperty('financials');
    const limited = await request(app.getHttpServer())
      .get('/dashboard/management')
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(200);
    expect(limited.body.accounts).not.toHaveProperty('financials');
    await request(app.getHttpServer())
      .get('/dashboard/management')
      .set('Authorization', `Bearer ${unauthorizedToken}`)
      .expect(403);
  });

  it('returns real Sales KPIs, attention count, conversion data, and date filtering', async () => {
    const response = await request(app.getHttpServer())
      .get('/dashboard/sales?dateFrom=2026-08-23&dateTo=2026-08-23')
      .set('Authorization', `Bearer ${managementToken}`)
      .expect(200);
    const directAttention = await prisma.lead.count({
      where: {
        status: {
          in: [
            LeadStatus.NEW,
            LeadStatus.HANDLING,
            LeadStatus.QUOTING,
            LeadStatus.FOLLOW_UP,
            LeadStatus.CALLBACK,
            LeadStatus.GOING_TO_BOOK,
          ],
        },
        isAttentionRequired: true,
      },
    });
    const directTotal = await prisma.lead.count({
      where: {
        createdAt: {
          gte: new Date('2026-08-23T00:00:00.000Z'),
          lte: new Date('2026-08-23T23:59:59.999Z'),
        },
      },
    });
    expect(response.body.kpis.attentionLeads).toBe(directAttention);
    expect(response.body.conversion.totalLeads).toBe(directTotal);
    expect(response.body.pipeline.QUOTING).toBeGreaterThanOrEqual(1);
    expect(response.body.ageing).toEqual(
      expect.objectContaining({
        zeroToOneDays: expect.any(Number),
        eightPlusDays: expect.any(Number),
      }),
    );
  });

  it('returns Operations, Accounts, HR, and IT counts from database state', async () => {
    const [operations, accounts, hr, it] = await Promise.all([
      request(app.getHttpServer())
        .get('/dashboard/operations')
        .set('Authorization', `Bearer ${managementToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/dashboard/accounts')
        .set('Authorization', `Bearer ${managementToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/dashboard/hr')
        .set('Authorization', `Bearer ${managementToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get('/dashboard/it')
        .set('Authorization', `Bearer ${managementToken}`)
        .expect(200),
    ]);
    expect(operations.body.kpis.operationsPending).toBe(
      await prisma.booking.count({ where: { operationsStatus: 'PENDING' } }),
    );
    expect(accounts.body.kpis.reconciliationPending).toBe(
      await prisma.reconciliation.count({ where: { status: 'PENDING' } }),
    );
    expect(hr.body.kpis.activeEmployees).toBe(
      await prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
    );
    expect(it.body.kpis.openTickets).toBe(
      await prisma.iTTicket.count({
        where: {
          status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_USER'] },
        },
      }),
    );
  });

  it('securely creates website leads, reuses customers, and prevents duplicate delivery', async () => {
    const newPayload = {
      firstName: 'Web',
      lastName: 'Traveller',
      email: `new-web-${suffix}@test.local`,
      phone: `+9476${String(suffix).slice(-7)}`,
      destination: 'Maldives',
      travelDate: '2026-12-10',
      message: 'Holiday enquiry',
      source: 'NEO_WEBSITE',
      externalReference: `WEB-NEW-${suffix}`,
    };
    const created = await request(app.getHttpServer())
      .post('/integrations/website/leads')
      .set('x-webhook-secret', process.env.WEBSITE_WEBHOOK_SECRET!)
      .send(newPayload)
      .expect(201);
    expect(created.body.duplicate).toBe(false);
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: created.body.leadId },
    });
    expect(lead.status).toBe('NEW');
    expect(lead.assignedUserId).toBeNull();
    expect(lead.source).toBe('WEBSITE');
    const live = await request(app.getHttpServer())
      .get('/leads/live?limit=100')
      .set('Authorization', `Bearer ${managementToken}`)
      .expect(200);
    expect(
      live.body.data.some(
        (item: { id: string }) => item.id === created.body.leadId,
      ),
    ).toBe(true);
    const duplicate = await request(app.getHttpServer())
      .post('/integrations/website/leads')
      .set('x-webhook-secret', process.env.WEBSITE_WEBHOOK_SECRET!)
      .send(newPayload)
      .expect(201);
    expect(duplicate.body).toEqual(
      expect.objectContaining({ duplicate: true, leadId: created.body.leadId }),
    );
    const existing = await request(app.getHttpServer())
      .post('/integrations/website/leads')
      .set('x-webhook-secret', process.env.WEBSITE_WEBHOOK_SECRET!)
      .send({
        firstName: 'Existing',
        lastName: 'Customer',
        email: `existing-web-${suffix}@test.local`,
        externalReference: `WEB-EXISTING-${suffix}`,
      })
      .expect(201);
    expect(existing.body.customerId).toBe(baselineCustomerId);
    await request(app.getHttpServer())
      .post('/integrations/website/leads')
      .set('x-webhook-secret', 'wrong-secret')
      .send({ ...newPayload, externalReference: `WEB-BAD-${suffix}` })
      .expect(403);
    expect(
      await prisma.integrationEvent.count({
        where: {
          eventType: 'WEBSITE_LEAD',
          externalReference: `WEB-NEW-${suffix}`,
          status: 'SUCCESS',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { actorId: managementUserId, action: 'WEB_LEAD_RECEIVED' },
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('returns safe provider status and preserves an error state without exposing secrets', async () => {
    const initial = await request(app.getHttpServer())
      .get('/integrations/status')
      .set('Authorization', `Bearer ${managementToken}`)
      .expect(200);
    expect(initial.body.wise.status).toBe('NOT_CONFIGURED');
    expect(initial.body.telephony.status).toBe('NOT_CONFIGURED');
    expect(initial.body.website.status).toBe('CONNECTED');
    expect(JSON.stringify(initial.body)).not.toContain(
      process.env.WEBSITE_WEBHOOK_SECRET,
    );
    await prisma.integrationProvider.update({
      where: { type_name: { type: 'WEBSITE', name: 'Neo Tourism Website' } },
      data: {
        status: 'ERROR',
        lastErrorAt: new Date(),
        lastErrorMessage: 'Safe test failure.',
      },
    });
    const degraded = await request(app.getHttpServer())
      .get('/integrations/status')
      .set('Authorization', `Bearer ${managementToken}`)
      .expect(200);
    expect(degraded.body.website.status).toBe('ERROR');
    expect(degraded.body.website.lastErrorMessage).toBe('Safe test failure.');
  });

  it('returns a controlled error for unconfigured telephony and protects call logs', async () => {
    const before = await prisma.callLog.count();
    await request(app.getHttpServer())
      .post(`/integrations/telephony/leads/${baselineLeadId}/call`)
      .set('Authorization', `Bearer ${managementToken}`)
      .expect(503)
      .expect(({ body }) =>
        expect(body.message).toBe('Telephony integration is not configured.'),
      );
    expect(await prisma.callLog.count()).toBe(before);
    await request(app.getHttpServer())
      .get('/integrations/telephony/calls')
      .set('Authorization', `Bearer ${unauthorizedToken}`)
      .expect(403);
  });

  afterAll(async () => {
    if (prisma) {
      const userIds = [
        managementUserId,
        limitedUserId,
        unauthorizedUserId,
      ].filter(Boolean);
      const customers = await prisma.customer.findMany({
        where: {
          OR: [
            { id: baselineCustomerId },
            {
              email: {
                in: [
                  `new-web-${suffix}@test.local`,
                  `existing-web-${suffix}@test.local`,
                ],
              },
            },
          ],
        },
        select: { id: true },
      });
      const customerIds = customers.map(({ id }) => id);
      await prisma.integrationEvent.deleteMany({
        where: { externalReference: { contains: String(suffix) } },
      });
      await prisma.leadActivity.deleteMany({
        where: { lead: { customerId: { in: customerIds } } },
      });
      await prisma.lead.deleteMany({
        where: { customerId: { in: customerIds } },
      });
      await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
      await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
      await prisma.notification.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      const roleIds = [
        managementRoleId,
        limitedRoleId,
        unauthorizedRoleId,
      ].filter(Boolean);
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
      await prisma.integrationEvent.deleteMany({
        where: {
          provider: {
            name: {
              in: ['Wise / Banking', 'Telephony / PBX', 'Neo Tourism Website'],
            },
          },
        },
      });
      await prisma.integrationProvider.deleteMany({
        where: {
          name: {
            in: ['Wise / Banking', 'Telephony / PBX', 'Neo Tourism Website'],
          },
        },
      });
    }
    if (app) await app.close();
    restore('WEBSITE_WEBHOOK_SECRET', originalEnv.website);
    restore('WISE_API_TOKEN', originalEnv.wise);
    restore('PBX_API_URL', originalEnv.pbxUrl);
    restore('PBX_API_TOKEN', originalEnv.pbxToken);
    restore('INTEGRATION_SYSTEM_USER_EMAIL', originalEnv.systemUser);
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
