/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('NEO SIGNAL and NEO RADAR (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let managerToken: string;
  let limitedToken: string;
  let managerId: string;
  let limitedId: string;
  let customerId: string;
  let campaignId: string;
  let secondCampaignId: string;
  let salesSignalId: string;
  let opportunityId: string;
  let generatedContentId: string;
  let generatedCampaignId: string;
  let linkedDealId: string;
  const leadIds: string[] = [];
  const saleIds: string[] = [];
  const bookingIds: string[] = [];
  const websiteLeadIds: string[] = [];
  const websiteCustomerIds: string[] = [];
  const websiteAttributionIds: string[] = [];
  const roleIds: string[] = [];
  const extraCampaignIds: string[] = [];
  const suffix = Date.now();
  const password = 'SignalRadar123!';
  const destination = `SignalDubai-${suffix}`;

  beforeAll(async () => {
    process.env.MARKETING_OPPORTUNITY_MIN_ENQUIRIES = '5';
    process.env.MARKETING_OPPORTUNITY_MIN_GROWTH_PERCENT = '25';
    process.env.WEBSITE_WEBHOOK_SECRET = `signal-website-${suffix}`;
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

    const allMarketingPermissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'marketing.' } },
    });
    const makeRole = async (name: string, codes: string[]) => {
      const role = await prisma.role.create({
        data: {
          name: `${name}_${suffix}`,
          permissions: {
            create: allMarketingPermissions
              .filter(({ code }) => codes.includes(code))
              .map(({ id }) => ({ permissionId: id })),
          },
        },
      });
      roleIds.push(role.id);
      return role;
    };
    const managerRole = await makeRole(
      'SIGNAL_RADAR_MANAGER',
      allMarketingPermissions.map(({ code }) => code),
    );
    const limitedRole = await makeRole('SIGNAL_LIMITED', [
      'marketing.signal.view',
      'marketing.attribution.manage',
    ]);
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'Marketing' },
    });
    const passwordHash = await bcrypt.hash(password, 4);
    const makeUser = (kind: string, roleId: string) =>
      prisma.user.create({
        data: {
          email: `signal-${kind}-${suffix}@test.local`,
          passwordHash,
          firstName: kind,
          lastName: 'Tester',
          departmentId: department.id,
          roles: { create: { roleId } },
        },
      });
    const manager = await makeUser('manager', managerRole.id);
    const limited = await makeUser('limited', limitedRole.id);
    managerId = manager.id;
    limitedId = limited.id;
    const login = async (email: string) =>
      (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password })
          .expect(200)
      ).body.accessToken as string;
    managerToken = await login(manager.email);
    limitedToken = await login(limited.email);

    const customer = await prisma.customer.create({
      data: {
        firstName: 'Signal',
        lastName: 'Customer',
        email: `signal-customer-${suffix}@test.local`,
        createdById: managerId,
        updatedById: managerId,
      },
    });
    customerId = customer.id;
    const createCampaign = (code: string, name: string) =>
      prisma.marketingCampaign.create({
        data: {
          campaignCode: code,
          name,
          status: 'ACTIVE',
          ownerUserId: managerId,
          createdById: managerId,
          updatedById: managerId,
        },
      });
    const campaign = await createCampaign(
      `CMP-SIGNAL-${suffix}`,
      'Signal Exact Funnel',
    );
    const second = await createCampaign(
      `CMP-SECOND-${suffix}`,
      'Signal Manual Target',
    );
    campaignId = campaign.id;
    secondCampaignId = second.id;

    for (let index = 0; index < 10; index += 1) {
      const status =
        index < 3
          ? 'SALE_MADE'
          : index === 3
            ? 'GOING_TO_BOOK'
            : index < 6
              ? 'QUOTING'
              : 'NEW';
      const lead = await prisma.lead.create({
        data: {
          customerId,
          createdById: managerId,
          assignedUserId: managerId,
          source: 'SIGNAL_E2E',
          destination,
          status,
          travelDate: new Date('2027-03-01'),
        },
      });
      leadIds.push(lead.id);
      if (index < 4)
        await prisma.leadActivity.createMany({
          data: [
            {
              leadId: lead.id,
              userId: managerId,
              type: 'STATUS_CHANGED',
              description: 'Status changed from HANDLING to QUOTING',
            },
            ...(index < 3
              ? [
                  {
                    leadId: lead.id,
                    userId: managerId,
                    type: 'STATUS_CHANGED' as const,
                    description: 'Status changed from QUOTING to GOING_TO_BOOK',
                  },
                ]
              : []),
          ],
        });
      await prisma.marketingAttribution.create({
        data: {
          campaignId,
          leadId: lead.id,
          customerId,
          confidence: 'TRACKED',
          source: 'UTM',
          externalReference: `signal-${suffix}-${index}`,
          createdByUserId: managerId,
        },
      });
      if (index === 0)
        await prisma.marketingAttribution.create({
          data: {
            campaignId,
            leadId: lead.id,
            customerId,
            confidence: 'TRACKED',
            source: 'OTHER',
            externalReference: `signal-duplicate-${suffix}`,
            createdByUserId: managerId,
          },
        });
      if (index < 3) {
        const sale = await prisma.saleSubmission.create({
          data: {
            leadId: lead.id,
            customerId,
            submittedByUserId: managerId,
            destination,
            sellingPrice: [700, 900, 400][index],
            currency: 'GBP',
            status: 'SUBMITTED_TO_ADMIN',
            submittedAt: new Date(),
          },
        });
        saleIds.push(sale.id);
        const booking = await prisma.booking.create({
          data: {
            folderNumber: `SIG-${suffix}-${index}`,
            customerId,
            leadId: lead.id,
            saleSubmissionId: sale.id,
            salesAdvisorId: managerId,
            destination,
            travelStartDate: new Date('2027-03-01'),
            sellingPrice: [700, 900, 400][index],
            currency: 'GBP',
            createdById: managerId,
          },
        });
        bookingIds.push(booking.id);
        await prisma.marketingAttribution.updateMany({
          where: { leadId: lead.id },
          data: {
            saleSubmissionId: sale.id,
            bookingId: booking.id,
            convertedAt: new Date(),
          },
        });
      }
    }
    salesSignalId = (
      await prisma.marketingSalesSignal.create({
        data: {
          signalType: 'CONTENT_REQUEST',
          title: 'Dubai visa explainer requested',
          description: 'Sales repeatedly receives the same visa question.',
          destination,
          priority: 'HIGH',
          status: 'NEW',
          createdByUserId: managerId,
        },
      })
    ).id;
  });

  it('calculates the exact funnel without duplicate-touch inflation and uses selling value', async () => {
    const body = (
      await request(app.getHttpServer())
        .get(`/marketing/signal?campaignId=${campaignId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200)
    ).body;
    const row = body.campaigns.find(
      (item: { id: string }) => item.id === campaignId,
    );
    expect(row).toEqual(
      expect.objectContaining({
        enquiries: 10,
        quoting: 6,
        goingToBook: 4,
        salesMade: 3,
        bookings: 3,
        salesContribution: 2000,
        currency: 'GBP',
      }),
    );
    expect(row.rates).toEqual({
      enquiryToQuote: 60,
      quoteToSale: 50,
      enquiryToSale: 30,
      saleToBooking: 100,
    });
    expect(body.summary.bestCampaignBySales.id).toBe(campaignId);
    expect(body.salesContributionVisibility.profit).toBe(false);
  });

  it('keeps Most Sales separate from Highest Sales Contribution', async () => {
    const createRankingCampaign = async (
      label: string,
      count: number,
      value: number,
    ) => {
      const campaign = await prisma.marketingCampaign.create({
        data: {
          campaignCode: `CMP-RANK-${label}-${suffix}`,
          name: `Ranking ${label}`,
          status: 'ACTIVE',
          ownerUserId: managerId,
          createdById: managerId,
          updatedById: managerId,
        },
      });
      extraCampaignIds.push(campaign.id);
      for (let index = 0; index < count; index += 1) {
        const lead = await prisma.lead.create({
          data: {
            customerId,
            createdById: managerId,
            status: 'SALE_MADE',
            source: `RANK_${label}_${suffix}`,
          },
        });
        leadIds.push(lead.id);
        const sale = await prisma.saleSubmission.create({
          data: {
            leadId: lead.id,
            customerId,
            submittedByUserId: managerId,
            sellingPrice: value,
            currency: 'GBP',
            status: 'SUBMITTED_TO_ADMIN',
            submittedAt: new Date(),
          },
        });
        saleIds.push(sale.id);
        const booking = await prisma.booking.create({
          data: {
            folderNumber: `RANK-${label}-${suffix}-${index}`,
            customerId,
            leadId: lead.id,
            saleSubmissionId: sale.id,
            salesAdvisorId: managerId,
            destination: 'Ranking Test',
            travelStartDate: new Date('2027-04-01'),
            sellingPrice: value,
            currency: 'GBP',
            createdById: managerId,
          },
        });
        bookingIds.push(booking.id);
        await prisma.marketingAttribution.create({
          data: {
            campaignId: campaign.id,
            leadId: lead.id,
            customerId,
            saleSubmissionId: sale.id,
            bookingId: booking.id,
            confidence: 'DIRECT',
            source: 'ERP_LINK',
            externalReference: `rank-${label}-${suffix}-${index}`,
            convertedAt: new Date(),
            createdByUserId: managerId,
          },
        });
      }
      return campaign;
    };
    const mostSales = await createRankingCampaign('A', 5, 1000);
    const highestValue = await createRankingCampaign('B', 4, 1750);
    const body = (
      await request(app.getHttpServer())
        .get('/marketing/signal')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200)
    ).body;
    expect(body.campaignRankings.mostSales[0]).toEqual(
      expect.objectContaining({ id: mostSales.id, salesMade: 5 }),
    );
    expect(body.campaignRankings.highestSalesContribution[0]).toEqual(
      expect.objectContaining({ id: highestValue.id, salesContribution: 7000 }),
    );
    expect(body.summary.bestCampaignBySales.id).toBe(mostSales.id);
  });

  it('reports exact attribution coverage for the selected period', async () => {
    const firstTouchAt = new Date('2020-06-15T12:00:00.000Z');
    for (let index = 0; index < 4; index += 1) {
      const lead = await prisma.lead.create({
        data: {
          customerId,
          createdById: managerId,
          source: `COVERAGE_${suffix}`,
          createdAt: firstTouchAt,
        },
      });
      leadIds.push(lead.id);
      await prisma.marketingAttribution.create({
        data: {
          campaignId: index < 3 ? campaignId : undefined,
          leadId: lead.id,
          customerId,
          confidence: index < 3 ? 'DIRECT' : 'UNATTRIBUTED',
          source: index < 3 ? 'ERP_LINK' : 'OTHER',
          externalReference: `coverage-${suffix}-${index}`,
          firstTouchAt,
          createdByUserId: managerId,
        },
      });
    }
    const body = (
      await request(app.getHttpServer())
        .get(
          '/marketing/signal?dateFrom=2020-06-15T00:00:00.000Z&dateTo=2020-06-15T23:59:59.999Z',
        )
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200)
    ).body;
    expect(body.dataQuality).toEqual({
      totalLeads: 4,
      attributedLeads: 3,
      unattributedLeads: 1,
      attributionCoveragePercent: 75,
    });
  });

  it('separates standard performance access from management detail', async () => {
    await request(app.getHttpServer())
      .get('/marketing/signal')
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/marketing/signal/management')
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/marketing/radar')
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(403);
  });

  it('creates tracked, unattributed, and safely invalid website enquiries in CRM', async () => {
    const send = (payload: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/integrations/website/leads')
        .set('x-webhook-secret', process.env.WEBSITE_WEBHOOK_SECRET!)
        .send(payload)
        .expect(201);
    const base = {
      firstName: 'Website',
      lastName: 'Signal',
      destination,
    };
    const tracked = (
      await send({
        ...base,
        email: `signal-web-tracked-${suffix}@test.local`,
        externalReference: `SIGNAL-WEB-TRACKED-${suffix}`,
        campaignId,
        utmSource: 'newsletter',
      })
    ).body;
    const untracked = (
      await send({
        ...base,
        email: `signal-web-untracked-${suffix}@test.local`,
        externalReference: `SIGNAL-WEB-UNTRACKED-${suffix}`,
      })
    ).body;
    const invalid = (
      await send({
        ...base,
        email: `signal-web-invalid-${suffix}@test.local`,
        externalReference: `SIGNAL-WEB-INVALID-${suffix}`,
        campaignId: '11111111-1111-4111-8111-111111111111',
      })
    ).body;
    for (const response of [tracked, untracked, invalid]) {
      websiteLeadIds.push(response.leadId as string);
      websiteCustomerIds.push(response.customerId as string);
      websiteAttributionIds.push(response.attribution.id as string);
    }
    expect(tracked.attribution).toEqual(
      expect.objectContaining({ confidence: 'TRACKED', warning: null }),
    );
    expect(untracked.attribution).toEqual(
      expect.objectContaining({ confidence: 'UNATTRIBUTED', warning: null }),
    );
    expect(invalid.attribution.confidence).toBe('UNATTRIBUTED');
    expect(invalid.attribution.warning).toContain('Campaign');
    expect(
      await prisma.lead.count({ where: { id: { in: websiteLeadIds } } }),
    ).toBe(3);
  });

  it('requires explicit override authority and keeps attribution history with an audit reason', async () => {
    const leadId = leadIds[0];
    await request(app.getHttpServer())
      .post('/marketing/attribution/manual')
      .set('Authorization', `Bearer ${limitedToken}`)
      .send({
        leadId,
        campaignId: secondCampaignId,
        reason: 'UAT attempted override',
      })
      .expect(409);
    const changed = await request(app.getHttpServer())
      .post('/marketing/attribution/manual')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        leadId,
        campaignId: secondCampaignId,
        reason: 'Verified against the signed campaign response record.',
      })
      .expect(201);
    expect(changed.body).toEqual(
      expect.objectContaining({
        campaignId: secondCampaignId,
        confidence: 'MANUAL',
        source: 'MANUAL',
        isActive: true,
      }),
    );
    const history = await prisma.marketingAttribution.findMany({
      where: { leadId },
    });
    expect(
      history.some(
        ({ campaignId: id, isActive }) => id === campaignId && !isActive,
      ),
    ).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'MarketingAttribution',
          entityId: changed.body.id,
          action: 'MARKETING_ATTRIBUTION_CHANGED',
        },
      }),
    ).toBe(1);
  });

  it('reuses CRM trends and Sales signals, then requires a human to create and action an opportunity', async () => {
    const day = 86400000;
    const today = new Date();
    const currentStart = new Date(today.getTime() - 5 * day);
    const previousStart = new Date(today.getTime() - 12 * day);
    const radarDestination = `RadarDubai-${suffix}`;
    const lowVolumeDestination = `RadarLow-${suffix}`;
    await prisma.lead.createMany({
      data: [
        ...Array.from({ length: 35 }, (_, index) => ({
          customerId,
          createdById: managerId,
          source: `RADAR_EXACT_${suffix}`,
          destination: radarDestination,
          createdAt: new Date(currentStart.getTime() + (index % 5) * 3600000),
        })),
        ...Array.from({ length: 20 }, (_, index) => ({
          customerId,
          createdById: managerId,
          source: `RADAR_EXACT_${suffix}`,
          destination: radarDestination,
          createdAt: new Date(previousStart.getTime() + (index % 5) * 3600000),
        })),
        ...Array.from({ length: 3 }, (_, index) => ({
          customerId,
          createdById: managerId,
          source: `RADAR_EXACT_${suffix}`,
          destination: lowVolumeDestination,
          createdAt: new Date(currentStart.getTime() + index * 3600000),
        })),
        {
          customerId,
          createdById: managerId,
          source: `RADAR_EXACT_${suffix}`,
          destination: lowVolumeDestination,
          createdAt: previousStart,
        },
      ],
    });
    leadIds.push(
      ...(
        await prisma.lead.findMany({
          where: { source: `RADAR_EXACT_${suffix}` },
          select: { id: true },
        })
      ).map(({ id }) => id),
    );
    const body = (
      await request(app.getHttpServer())
        .get('/marketing/radar')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200)
    ).body;
    expect(
      body.risingDestinations.find(
        (item: { destination: string }) =>
          item.destination === radarDestination,
      ),
    ).toEqual(
      expect.objectContaining({
        currentPeriodEnquiries: 35,
        previousPeriodEnquiries: 20,
        growthPercent: 75,
        trending: true,
      }),
    );
    expect(
      body.suggestedOpportunities.some(
        (item: { destination: string }) =>
          item.destination === lowVolumeDestination,
      ),
    ).toBe(false);
    expect(
      body.salesSignals.items.some(
        (item: { id: string }) => item.id === salesSignalId,
      ),
    ).toBe(true);
    const suggestion = body.suggestedOpportunities.find(
      (item: { destination: string }) => item.destination === radarDestination,
    );
    expect(suggestion).toEqual(
      expect.objectContaining({ deterministic: true, sourceType: 'CRM_TREND' }),
    );
    expect(
      body.opportunities.some(
        (item: { sourceReferenceId: string }) =>
          item.sourceReferenceId === suggestion.sourceReferenceId,
      ),
    ).toBe(false);
    const opportunityPayload = {
      sourceType: suggestion.sourceType,
      sourceReferenceId: suggestion.sourceReferenceId,
      title: suggestion.title,
      description: suggestion.description,
      destination: suggestion.destination,
      priority: suggestion.priority,
    };
    const created = await request(app.getHttpServer())
      .post('/marketing/opportunities')
      .set('Authorization', `Bearer ${managerToken}`)
      .send(opportunityPayload)
      .expect(201);
    opportunityId = created.body.id;
    await request(app.getHttpServer())
      .patch(`/marketing/opportunities/${opportunityId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'ACCEPTED' })
      .expect(200);
    const content = await request(app.getHttpServer())
      .post(`/marketing/opportunities/${opportunityId}/create-content`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    generatedContentId = content.body.id;
    expect(content.body.stage).toBe('IDEA');
    expect(
      (
        await prisma.marketingOpportunity.findUniqueOrThrow({
          where: { id: opportunityId },
        })
      ).status,
    ).toBe('ACTIONED');
    const actions = (
      await prisma.auditLog.findMany({
        where: { entityType: 'MarketingOpportunity', entityId: opportunityId },
        select: { action: true },
      })
    ).map(({ action }) => action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'MARKETING_OPPORTUNITY_CREATED',
        'MARKETING_OPPORTUNITY_ACCEPTED',
        'MARKETING_OPPORTUNITY_ACTIONED',
      ]),
    );

    const campaignOpportunity = await request(app.getHttpServer())
      .post('/marketing/opportunities')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        sourceType: 'MANUAL',
        title: 'Campaign action test',
        description: 'Verified campaign opportunity.',
        priority: 'NORMAL',
      })
      .expect(201);
    const generatedCampaign = await request(app.getHttpServer())
      .post(
        `/marketing/opportunities/${campaignOpportunity.body.id}/create-campaign`,
      )
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    generatedCampaignId = generatedCampaign.body.id;
    extraCampaignIds.push(generatedCampaignId);
    expect(
      (
        await prisma.marketingOpportunity.findUniqueOrThrow({
          where: { id: campaignOpportunity.body.id },
        })
      ).campaignId,
    ).toBe(generatedCampaignId);

    const linkedDeal = await prisma.marketingDeal.create({
      data: {
        dealCode: `DEAL-RADAR-${suffix}`,
        title: 'Radar Link Deal',
        destination: 'Dubai',
        departureLocation: 'London',
        travelStartDate: new Date('2027-05-01'),
        travelEndDate: new Date('2027-05-08'),
        price: 799,
        currency: 'GBP',
        keyTerms: 'UAT only',
        expiryAt: new Date('2027-01-01'),
        createdById: managerId,
        updatedById: managerId,
      },
    });
    linkedDealId = linkedDeal.id;
    const linkOpportunity = await request(app.getHttpServer())
      .post('/marketing/opportunities')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        sourceType: 'MANUAL',
        title: 'Deal link test',
        description: 'Verified Deal relationship.',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/opportunities/${linkOpportunity.body.id}/link-deal`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ dealId: linkedDealId })
      .expect(201);
    expect(
      (
        await prisma.marketingOpportunity.findUniqueOrThrow({
          where: { id: linkOpportunity.body.id },
        })
      ).dealId,
    ).toBe(linkedDealId);

    const dismissOpportunity = await request(app.getHttpServer())
      .post('/marketing/opportunities')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        sourceType: 'MANUAL',
        title: 'Dismiss test',
        description: 'Not a viable action.',
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/marketing/opportunities/${dismissOpportunity.body.id}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: 'DISMISSED' })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'MarketingOpportunity',
          entityId: dismissOpportunity.body.id,
          action: 'MARKETING_OPPORTUNITY_DISMISSED',
        },
      }),
    ).toBe(1);
  });

  afterAll(async () => {
    if (!prisma) return;
    const websiteEvents = await prisma.integrationEvent.findMany({
      where: { externalReference: { contains: `-${suffix}` } },
      select: { id: true },
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: [managerId, limitedId] } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: [managerId, limitedId] } },
          { entityId: { in: websiteAttributionIds } },
          { entityId: { in: websiteEvents.map(({ id }) => id) } },
        ],
      },
    });
    await prisma.integrationEvent.deleteMany({
      where: { id: { in: websiteEvents.map(({ id }) => id) } },
    });
    await prisma.marketingOpportunity.deleteMany({
      where: { createdByUserId: managerId },
    });
    if (generatedContentId)
      await prisma.marketingContent
        .delete({ where: { id: generatedContentId } })
        .catch(() => undefined);
    await prisma.marketingSalesSignal.deleteMany({
      where: { id: salesSignalId },
    });
    await prisma.marketingAttribution.deleteMany({
      where: { leadId: { in: [...leadIds, ...websiteLeadIds] } },
    });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.saleSubmission.deleteMany({ where: { id: { in: saleIds } } });
    await prisma.leadActivity.deleteMany({
      where: { leadId: { in: leadIds } },
    });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: websiteLeadIds } } });
    await prisma.marketingCampaign.deleteMany({
      where: {
        id: { in: [campaignId, secondCampaignId, ...extraCampaignIds] },
      },
    });
    if (linkedDealId)
      await prisma.marketingDeal
        .delete({ where: { id: linkedDealId } })
        .catch(() => undefined);
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.customer.deleteMany({
      where: { id: { in: websiteCustomerIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [managerId, limitedId] } },
    });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await app.close();
  });
});
