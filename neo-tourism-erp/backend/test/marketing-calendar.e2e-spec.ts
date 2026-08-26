/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { MarketingAlertsService } from '../src/marketing/calendar/services/marketing-alerts.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('NEO PLAN calendar and Meta foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let alerts: MarketingAlertsService;
  let managerToken: string;
  let salesToken: string;
  let managerId: string;
  let roleId: string;
  let salesRoleId: string;
  let dealId: string;
  let campaignId: string;
  let contentId: string;
  let versionId: string;
  let publicationId: string;
  let manualId: string;
  const suffix = Date.now();
  const password = 'NeoPlan123!';
  const originalMock = process.env.META_MOCK_ENABLED;
  const originalFail = process.env.META_MOCK_FAIL;
  const originalCoverage = process.env.MARKETING_CONTENT_COVERAGE_DAYS;
  const now = new Date();

  beforeAll(async () => {
    process.env.META_MOCK_ENABLED = 'true';
    process.env.META_MOCK_FAIL = 'false';
    process.env.MARKETING_CONTENT_COVERAGE_DAYS = '1,2,3,4,5,6,7';
    process.env.META_MOCK_SCHEDULED_AT = new Date(
      now.getTime() + 2 * 86400000,
    ).toISOString();
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
    alerts = app.get(MarketingAlertsService);
    const codes = [
      'marketing.calendar.view',
      'marketing.calendar.create',
      'marketing.calendar.edit',
      'marketing.calendar.reschedule',
      'marketing.alert.view',
      'integration.meta.view',
      'integration.meta.sync',
    ];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: codes } },
    });
    const managerRole = await prisma.role.create({
      data: {
        name: `PLAN_MANAGER_${suffix}`,
        permissions: {
          create: permissions.map((x) => ({ permissionId: x.id })),
        },
      },
    });
    roleId = managerRole.id;
    const salesRole = await prisma.role.create({
      data: { name: `PLAN_SALES_${suffix}` },
    });
    salesRoleId = salesRole.id;
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'Marketing' },
    });
    const hash = await bcrypt.hash(password, 4);
    const manager = await prisma.user.create({
      data: {
        email: `plan-manager-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'Plan',
        lastName: 'Manager',
        departmentId: department.id,
        roles: { create: { roleId } },
      },
    });
    managerId = manager.id;
    const sales = await prisma.user.create({
      data: {
        email: `plan-sales-${suffix}@test.local`,
        passwordHash: hash,
        firstName: 'Plan',
        lastName: 'Sales',
        departmentId: department.id,
        roles: { create: { roleId: salesRoleId } },
      },
    });
    managerToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: manager.email, password })
        .expect(200)
    ).body.accessToken;
    salesToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: sales.email, password })
        .expect(200)
    ).body.accessToken;
    const deal = await prisma.marketingDeal.create({
      data: {
        dealCode: `PLAN-${suffix}`,
        title: 'Plan expiring offer',
        destination: 'Colombo',
        departureLocation: 'London',
        travelStartDate: new Date('2027-01-01'),
        travelEndDate: new Date('2027-01-05'),
        price: 500,
        currency: 'GBP',
        keyTerms: 'Test',
        expiryAt: new Date(now.getTime() + 12 * 3600000),
        status: 'LIVE',
        approvalStatus: 'APPROVED',
        createdById: manager.id,
        updatedById: manager.id,
      },
    });
    dealId = deal.id;
    const campaign = await prisma.marketingCampaign.create({
      data: {
        campaignCode: `CMP-PLAN-${suffix}`,
        name: 'Plan Campaign',
        status: 'PLANNED',
        startDate: new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
          ),
        ),
        endDate: new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 4,
          ),
        ),
        ownerUserId: manager.id,
        dealId,
        createdById: manager.id,
        updatedById: manager.id,
      },
    });
    campaignId = campaign.id;
    const content = await prisma.marketingContent.create({
      data: {
        contentCode: `CONTENT-PLAN-${suffix}`,
        title: 'Plan Instagram Reel',
        contentType: 'REEL',
        stage: 'READY',
        campaignId,
        dealId,
        assignedUserId: manager.id,
        deadline: new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - 1,
          ),
        ),
        createdById: manager.id,
        updatedById: manager.id,
      },
    });
    contentId = content.id;
    const version = await prisma.marketingContentVersion.create({
      data: {
        contentId,
        versionNumber: 1,
        fileName: 'plan.png',
        createdById: manager.id,
      },
    });
    versionId = version.id;
    await prisma.marketingContent.update({
      where: { id: contentId },
      data: { currentVersionId: versionId },
    });
    await prisma.marketingContentApproval.create({
      data: {
        contentId,
        contentVersionId: versionId,
        status: 'APPROVED',
        requestedById: manager.id,
        reviewerUserId: manager.id,
        reviewedAt: now,
      },
    });
    const publication = await prisma.marketingPublication.create({
      data: {
        contentId,
        contentVersionId: versionId,
        channel: 'INSTAGRAM',
        status: 'SCHEDULED',
        scheduledAt: new Date(now.getTime() + 2 * 86400000),
      },
    });
    publicationId = publication.id;
  });

  it('aggregates campaigns, deal expiry, deadlines, publications and manual events without copies', async () => {
    const manual = await request(app.getHttpServer())
      .post('/marketing/calendar')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        title: 'Brand shoot',
        entryType: 'INTERNAL_EVENT',
        startAt: new Date(now.getTime() + 86400000).toISOString(),
        allDay: true,
      })
      .expect(201);
    manualId = manual.body.id;
    const from = new Date(now.getTime() - 3 * 86400000).toISOString();
    const to = new Date(now.getTime() + 8 * 86400000).toISOString();
    const response = await request(app.getHttpServer())
      .get(
        `/marketing/calendar?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
      )
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    const ids = response.body.map((x: { id: string }) => x.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        `campaign:${campaignId}`,
        `deal-expiry:${dealId}`,
        `content-deadline:${contentId}`,
        `publication:${publicationId}`,
        `manual:${manualId}`,
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
    await request(app.getHttpServer())
      .get(
        `/marketing/calendar?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
      )
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(403);
  });

  it('reschedules the authoritative publication and protects expiry and published records', async () => {
    const next = new Date(now.getTime() + 3 * 86400000);
    await request(app.getHttpServer())
      .patch(
        `/marketing/calendar/${encodeURIComponent(`publication:${publicationId}`)}/reschedule`,
      )
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ startAt: next.toISOString() })
      .expect(200);
    expect(
      (
        await prisma.marketingPublication.findUniqueOrThrow({
          where: { id: publicationId },
        })
      ).scheduledAt?.toISOString(),
    ).toBe(next.toISOString());
    await request(app.getHttpServer())
      .patch(
        `/marketing/calendar/${encodeURIComponent(`deal-expiry:${dealId}`)}/reschedule`,
      )
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ startAt: next.toISOString() })
      .expect(409);
    await request(app.getHttpServer())
      .patch(
        `/marketing/calendar/${encodeURIComponent(`publication:${publicationId}`)}/reschedule`,
      )
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ startAt: next.toISOString() })
      .expect(403);
    await prisma.marketingPublication.update({
      where: { id: publicationId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    await request(app.getHttpServer())
      .patch(
        `/marketing/calendar/${encodeURIComponent(`publication:${publicationId}`)}/reschedule`,
      )
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ startAt: new Date(next.getTime() + 86400000).toISOString() })
      .expect(409);
  });

  it('returns useful alerts and creates notifications idempotently', async () => {
    const response = await request(app.getHttpServer())
      .get('/marketing/calendar/alerts')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    const types = response.body.map((x: { type: string }) => x.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'DEAL_EXPIRING',
        'READY_TO_PUBLISH',
        'CONTENT_OVERDUE',
        'CAMPAIGN_STARTING',
        'CONTENT_GAP',
      ]),
    );
    await alerts.notify(now);
    const first = await prisma.notification.count({
      where: {
        userId: managerId,
        createdAt: {
          gte: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
          ),
        },
        type: {
          in: [
            'MARKETING_DEAL_EXPIRING',
            'MARKETING_READY_TO_PUBLISH',
            'MARKETING_CONTENT_OVERDUE',
            'MARKETING_CAMPAIGN_STARTING',
            'MARKETING_CONTENT_GAP',
          ],
        },
      },
    });
    await alerts.notify(now);
    const second = await prisma.notification.count({
      where: {
        userId: managerId,
        createdAt: {
          gte: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
          ),
        },
        type: {
          in: [
            'MARKETING_DEAL_EXPIRING',
            'MARKETING_READY_TO_PUBLISH',
            'MARKETING_CONTENT_OVERDUE',
            'MARKETING_CAMPAIGN_STARTING',
            'MARKETING_CONTENT_GAP',
          ],
        },
      },
    });
    expect(second).toBe(first);
  });

  it('reports Meta safely, syncs idempotently, and isolates provider failure', async () => {
    await request(app.getHttpServer())
      .get('/integrations/meta/status')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('CONNECTED');
        expect(body).not.toHaveProperty('accessToken');
      });
    await request(app.getHttpServer())
      .post('/integrations/meta/sync')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post('/integrations/meta/sync')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post('/integrations/meta/sync')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    expect(
      await prisma.externalMarketingEvent.count({
        where: { provider: 'META', externalReference: { startsWith: 'mock-' } },
      }),
    ).toBe(2);
    process.env.META_MOCK_FAIL = 'true';
    await request(app.getHttpServer())
      .post('/integrations/meta/sync')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('ERROR'));
    const from = new Date(now.getTime() - dayMs).toISOString(),
      to = new Date(now.getTime() + 8 * dayMs).toISOString();
    await request(app.getHttpServer())
      .get(
        `/marketing/calendar?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
      )
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200)
      .expect(({ body }) =>
        expect(
          body.some((x: { id: string }) => x.id === `deal-expiry:${dealId}`),
        ).toBe(true),
      );
    process.env.META_MOCK_ENABLED = 'false';
    process.env.META_MOCK_FAIL = 'false';
    await request(app.getHttpServer())
      .get('/integrations/meta/status')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('NOT_CONFIGURED'));
    await request(app.getHttpServer())
      .get(
        `/marketing/calendar?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
      )
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.marketingContent.updateMany({
      where: { id: contentId },
      data: { currentVersionId: null },
    });
    await prisma.notification.deleteMany({ where: { userId: managerId } });
    await prisma.auditLog.deleteMany({ where: { actorId: managerId } });
    await prisma.marketingCalendarEntry.deleteMany({ where: { id: manualId } });
    await prisma.marketingPublication.deleteMany({ where: { contentId } });
    await prisma.marketingContentApproval.deleteMany({ where: { contentId } });
    await prisma.marketingContentVersion.deleteMany({ where: { contentId } });
    await prisma.marketingContent.deleteMany({ where: { id: contentId } });
    await prisma.marketingCampaign.deleteMany({ where: { id: campaignId } });
    await prisma.marketingDeal.deleteMany({ where: { id: dealId } });
    await prisma.externalMarketingEvent.deleteMany({
      where: { provider: 'META', externalReference: { startsWith: 'mock-' } },
    });
    const provider = await prisma.integrationProvider.findUnique({
      where: { type_name: { type: 'META', name: 'Meta Business Suite' } },
    });
    if (provider) {
      await prisma.integrationEvent.deleteMany({
        where: { providerId: provider.id },
      });
      await prisma.integrationProvider.delete({ where: { id: provider.id } });
    }
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            `plan-manager-${suffix}@test.local`,
            `plan-sales-${suffix}@test.local`,
          ],
        },
      },
    });
    await prisma.role.deleteMany({
      where: { id: { in: [roleId, salesRoleId] } },
    });
    await app.close();
    process.env.META_MOCK_ENABLED = originalMock;
    process.env.META_MOCK_FAIL = originalFail;
    process.env.MARKETING_CONTENT_COVERAGE_DAYS = originalCoverage;
  });
});
const dayMs = 86400000;
