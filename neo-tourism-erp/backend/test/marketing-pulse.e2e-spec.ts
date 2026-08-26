/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('NEO PULSE command hub (e2e)', () => {
  let app: INestApplication<App>,
    prisma: PrismaService,
    managerToken: string,
    salesToken: string,
    noneToken: string;
  let managerId: string,
    salesId: string,
    customerId: string,
    leadId: string,
    dealId: string,
    suspendedDealId: string,
    campaignId: string,
    creatingId: string,
    reviewId: string,
    readyId: string,
    reviewVersionId: string,
    readyVersionId: string,
    pendingApprovalId: string,
    signalId: string;
  const roleIds: string[] = [];
  const suffix = Date.now(),
    password = 'PulseTest123!',
    destination = `PulseDubai-${suffix}`,
    smallDestination = `PulseBali-${suffix}`,
    now = new Date();
  const day = 86400000;
  beforeAll(async () => {
    process.env.MARKETING_TREND_MIN_CURRENT_ENQUIRIES = '5';
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
    const managerCodes = [
      'marketing.pulse.view',
      'marketing.deal.view',
      'marketing.content.view',
      'marketing.approval.view',
      'marketing.calendar.view',
      'marketing.alert.view',
      'marketing.sales_signal.view',
      'marketing.sales_signal.manage',
      'marketing.workload.view',
      'lead.view',
    ];
    const permissions = await prisma.permission.findMany({
      where: {
        code: { in: [...managerCodes, 'marketing.sales_signal.create'] },
      },
    });
    const role = async (name: string, codes: string[]) => {
      const value = await prisma.role.create({
        data: {
          name: `${name}_${suffix}`,
          permissions: {
            create: permissions
              .filter((x) => codes.includes(x.code))
              .map((x) => ({ permissionId: x.id })),
          },
        },
      });
      roleIds.push(value.id);
      return value;
    };
    const managerRole = await role('PULSE_MANAGER', managerCodes),
      salesRole = await role('PULSE_SALES', ['marketing.sales_signal.create']),
      noneRole = await role('PULSE_NONE', []);
    const dep = await prisma.department.findUniqueOrThrow({
        where: { name: 'Marketing' },
      }),
      hash = await bcrypt.hash(password, 4);
    const user = async (kind: string, roleId: string) =>
      prisma.user.create({
        data: {
          email: `pulse-${kind.toLowerCase()}-${suffix}@test.local`,
          passwordHash: hash,
          firstName: kind,
          lastName: 'Pulse',
          departmentId: dep.id,
          roles: { create: { roleId } },
        },
      });
    const manager = await user('Manager', managerRole.id),
      sales = await user('Sales', salesRole.id),
      none = await user('None', noneRole.id);
    managerId = manager.id;
    salesId = sales.id;
    const login = async (email: string) =>
      (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password })
          .expect(200)
      ).body.accessToken;
    managerToken = await login(manager.email);
    salesToken = await login(sales.email);
    noneToken = await login(none.email);
    const customer = await prisma.customer.create({
      data: {
        firstName: 'Pulse',
        lastName: 'Customer',
        email: `pulse-customer-${suffix}@test.local`,
        createdById: sales.id,
        updatedById: sales.id,
      },
    });
    customerId = customer.id;
    const currentStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6),
      ),
      previousStart = new Date(currentStart.getTime() - 7 * day);
    const leads = [
      ...Array.from({ length: 20 }, (_, i) => ({
        customerId,
        createdById: sales.id,
        destination,
        source: 'PULSE_TEST',
        createdAt: new Date(currentStart.getTime() + (i % 6) * day + 3600000),
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        customerId,
        createdById: sales.id,
        destination,
        source: 'PULSE_TEST',
        createdAt: new Date(previousStart.getTime() + (i % 6) * day + 3600000),
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        customerId,
        createdById: sales.id,
        destination: smallDestination,
        source: 'PULSE_TEST',
        createdAt: new Date(currentStart.getTime() + i * day),
      })),
      {
        customerId,
        createdById: sales.id,
        destination: smallDestination,
        source: 'PULSE_TEST',
        createdAt: new Date(previousStart.getTime() + day),
      },
    ];
    await prisma.lead.createMany({ data: leads });
    leadId = (
      await prisma.lead.findFirstOrThrow({
        where: { destination },
        orderBy: { createdAt: 'desc' },
      })
    ).id;
    const baseDeal = {
      destination: 'Dubai',
      departureLocation: 'London',
      travelStartDate: new Date('2027-01-01'),
      travelEndDate: new Date('2027-01-07'),
      price: 700,
      currency: 'GBP',
      keyTerms: 'Pulse test',
      createdById: manager.id,
      updatedById: manager.id,
    };
    const deal = await prisma.marketingDeal.create({
      data: {
        ...baseDeal,
        dealCode: `PULSE-LIVE-${suffix}`,
        title: 'Pulse Live Deal',
        expiryAt: new Date(now.getTime() + 12 * 3600000),
        status: 'LIVE',
        approvalStatus: 'APPROVED',
        websitePublicationStatus: 'PUBLISHED',
      },
    });
    dealId = deal.id;
    const suspended = await prisma.marketingDeal.create({
      data: {
        ...baseDeal,
        dealCode: `PULSE-SUSP-${suffix}`,
        title: 'Pulse Suspended Deal',
        expiryAt: new Date(now.getTime() + 5 * day),
        status: 'SUSPENDED',
        approvalStatus: 'APPROVED',
        suspendedById: manager.id,
        suspendedAt: new Date(now.getTime() - 3600000),
        suspensionReason: 'Supplier withdrew inventory',
      },
    });
    suspendedDealId = suspended.id;
    const campaign = await prisma.marketingCampaign.create({
      data: {
        campaignCode: `CMP-PULSE-${suffix}`,
        name: 'Pulse Active Campaign',
        status: 'ACTIVE',
        startDate: new Date(now.getTime() - day),
        endDate: new Date(now.getTime() + 5 * day),
        ownerUserId: manager.id,
        dealId,
        createdById: manager.id,
        updatedById: manager.id,
      },
    });
    campaignId = campaign.id;
    const contentBase = {
      campaignId,
      dealId,
      assignedUserId: manager.id,
      createdById: manager.id,
      updatedById: manager.id,
      contentType: 'REEL' as const,
    };
    const creating = await prisma.marketingContent.create({
      data: {
        ...contentBase,
        contentCode: `CONTENT-PULSE-C-${suffix}`,
        title: 'Pulse Overdue Creative',
        stage: 'CREATING',
        deadline: new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - 1,
          ),
        ),
        priority: 'URGENT',
      },
    });
    creatingId = creating.id;
    const review = await prisma.marketingContent.create({
      data: {
        ...contentBase,
        contentCode: `CONTENT-PULSE-R-${suffix}`,
        title: 'Pulse Review Creative',
        stage: 'REVIEW',
        deadline: new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
          ),
        ),
      },
    });
    reviewId = review.id;
    const rv = await prisma.marketingContentVersion.create({
      data: {
        contentId: review.id,
        versionNumber: 1,
        caption: 'Review',
        createdById: manager.id,
      },
    });
    reviewVersionId = rv.id;
    await prisma.marketingContent.update({
      where: { id: review.id },
      data: { currentVersionId: rv.id },
    });
    const pending = await prisma.marketingContentApproval.create({
      data: {
        contentId: review.id,
        contentVersionId: rv.id,
        status: 'PENDING',
        requestedById: manager.id,
        requestedAt: new Date(now.getTime() - 4 * day),
      },
    });
    pendingApprovalId = pending.id;
    const ready = await prisma.marketingContent.create({
      data: {
        ...contentBase,
        contentCode: `CONTENT-PULSE-READY-${suffix}`,
        title: 'Pulse Ready Creative',
        stage: 'READY',
        deadline: new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 2,
          ),
        ),
      },
    });
    readyId = ready.id;
    const rdv = await prisma.marketingContentVersion.create({
      data: {
        contentId: ready.id,
        versionNumber: 1,
        caption: 'Ready',
        createdById: manager.id,
      },
    });
    readyVersionId = rdv.id;
    await prisma.marketingContent.update({
      where: { id: ready.id },
      data: { currentVersionId: rdv.id },
    });
    await prisma.marketingContentApproval.create({
      data: {
        contentId: ready.id,
        contentVersionId: rdv.id,
        status: 'APPROVED',
        requestedById: manager.id,
        reviewerUserId: manager.id,
        reviewedAt: now,
      },
    });
    await prisma.marketingPublication.create({
      data: {
        contentId: ready.id,
        contentVersionId: rdv.id,
        channel: 'INSTAGRAM',
        status: 'SCHEDULED',
        scheduledAt: new Date(now.getTime() + day),
      },
    });
  });
  it('returns real live, attention, content, approval, calendar and workload sections', async () => {
    const response = await request(app.getHttpServer())
      .get('/marketing/pulse?period=7_DAYS')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(response.body.deals.counts.LIVE).toBeGreaterThanOrEqual(1);
    expect(
      response.body.deals.liveDeals.some(
        (x: { id: string }) => x.id === dealId,
      ),
    ).toBe(true);
    expect(
      response.body.deals.attention.within24Hours.some(
        (x: { id: string }) => x.id === dealId,
      ),
    ).toBe(true);
    expect(
      response.body.deals.attention.suspended.some(
        (x: { id: string }) => x.id === suspendedDealId,
      ),
    ).toBe(true);
    expect(response.body.campaigns.active).toBeGreaterThanOrEqual(1);
    expect(response.body.content.counts.CREATING).toBeGreaterThanOrEqual(1);
    expect(response.body.content.counts.REVIEW).toBeGreaterThanOrEqual(1);
    expect(
      response.body.content.readyToPublish.some(
        (x: { id: string }) => x.id === readyId,
      ),
    ).toBe(true);
    expect(
      response.body.content.overdue.some(
        (x: { id: string }) => x.id === creatingId,
      ),
    ).toBe(true);
    expect(
      response.body.approvals.items.some(
        (x: { id: string; needsAttention: boolean }) =>
          x.id === pendingApprovalId && x.needsAttention,
      ),
    ).toBe(true);
    expect(
      response.body.calendar.next7Days.some((x: { publicationId: string }) =>
        Boolean(x.publicationId),
      ),
    ).toBe(true);
    const workload = response.body.workload.find(
      (x: { user: { id: string } }) => x.user.id === managerId,
    );
    expect(workload.assigned).toBeGreaterThanOrEqual(3);
    expect(workload.creating).toBeGreaterThanOrEqual(1);
    expect(workload.inReview).toBeGreaterThanOrEqual(1);
    expect(workload.overdue).toBeGreaterThanOrEqual(1);
    await request(app.getHttpServer())
      .get('/marketing/pulse')
      .set('Authorization', `Bearer ${noneToken}`)
      .expect(403);
  });
  it('calculates deterministic trends and protects low volume while admitting attribution is unavailable', async () => {
    const body = (
      await request(app.getHttpServer())
        .get('/marketing/pulse?period=30_DAYS')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200)
    ).body;
    const trend = body.crm.destinations.find(
      (x: { destination: string }) => x.destination === destination,
    );
    expect(trend).toEqual(
      expect.objectContaining({
        currentPeriodEnquiries: 20,
        previousPeriodEnquiries: 10,
        growthPercent: 100,
        trending: true,
      }),
    );
    const small = body.crm.destinations.find(
      (x: { destination: string }) => x.destination === smallDestination,
    );
    expect(small).toEqual(
      expect.objectContaining({
        currentPeriodEnquiries: 2,
        previousPeriodEnquiries: 1,
        growthPercent: 100,
        trending: false,
      }),
    );
    expect(body.crm.campaignEnquiries.status).toBe('NOT_YET_AVAILABLE');
  });
  it('removes approved work from pending approvals', async () => {
    const before = (
      await request(app.getHttpServer())
        .get('/marketing/pulse')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200)
    ).body.approvals.pendingCreative;
    await prisma.marketingContentApproval.update({
      where: { id: pendingApprovalId },
      data: {
        status: 'APPROVED',
        reviewerUserId: managerId,
        reviewedAt: new Date(),
      },
    });
    const after = (
      await request(app.getHttpServer())
        .get('/marketing/pulse')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200)
    ).body.approvals.pendingCreative;
    expect(after).toBe(before - 1);
  });
  it('separates Sales submission from Marketing management and audits actions', async () => {
    const created = await request(app.getHttpServer())
      .post('/marketing/sales-signals')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        leadId,
        signalType: 'CONTENT_REQUEST',
        title: 'Customers asking about Dubai visas',
        description: 'Several customers need a clear visa explainer.',
        priority: 'HIGH',
      })
      .expect(201);
    signalId = created.body.id;
    expect(created.body.destination).toBe(destination);
    await request(app.getHttpServer())
      .get('/marketing/sales-signals')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/marketing/sales-signals/${signalId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ status: 'ACTIONED' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/marketing/sales-signals')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.data.some((x: { id: string }) => x.id === signalId)).toBe(
          true,
        ),
      );
    await request(app.getHttpServer())
      .patch(`/marketing/sales-signals/${signalId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'ACTIONED' })
      .expect(200);
    const actions = await prisma.auditLog.findMany({
      where: { entityType: 'MarketingSalesSignal', entityId: signalId },
      select: { action: true },
    });
    expect(actions.map((x) => x.action)).toEqual(
      expect.arrayContaining([
        'MARKETING_SALES_SIGNAL_CREATED',
        'MARKETING_SALES_SIGNAL_ACTIONED',
      ]),
    );
  });
  afterAll(async () => {
    if (!prisma) return;
    const contentIds = [creatingId, reviewId, readyId].filter(
      (id): id is string => Boolean(id),
    );
    const versionIds = [reviewVersionId, readyVersionId].filter(
      (id): id is string => Boolean(id),
    );
    const dealIds = [dealId, suspendedDealId].filter((id): id is string =>
      Boolean(id),
    );
    await prisma.notification.deleteMany({
      where: {
        OR: [
          { userId: managerId },
          { entityType: 'MarketingSalesSignal', entityId: signalId },
        ],
      },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: [managerId, salesId] } },
          { entityType: 'MarketingSalesSignal', entityId: signalId },
        ],
      },
    });
    await prisma.marketingSalesSignal.deleteMany({
      where: { OR: [{ id: signalId }, { createdByUserId: salesId }] },
    });
    await prisma.marketingContent.updateMany({
      where: { id: { in: contentIds } },
      data: { currentVersionId: null },
    });
    await prisma.marketingPublication.deleteMany({
      where: { contentId: { in: contentIds } },
    });
    await prisma.marketingContentApproval.deleteMany({
      where: { contentId: { in: contentIds } },
    });
    await prisma.marketingContentVersion.deleteMany({
      where: { id: { in: versionIds } },
    });
    await prisma.marketingContent.deleteMany({
      where: { id: { in: contentIds } },
    });
    await prisma.marketingCampaign.deleteMany({ where: { id: campaignId } });
    await prisma.marketingDeal.deleteMany({ where: { id: { in: dealIds } } });
    await prisma.lead.deleteMany({
      where: { destination: { in: [destination, smallDestination] } },
    });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'pulse-', contains: String(suffix) } },
    });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await app.close();
  });
});
