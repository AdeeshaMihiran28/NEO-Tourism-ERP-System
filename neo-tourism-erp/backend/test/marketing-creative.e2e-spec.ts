/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('NEO FLOW and GREENLIGHT (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let creatorToken: string;
  let managerToken: string;
  let salesToken: string;
  let creatorId: string;
  let dealId: string;
  let campaignId: string;
  let contentId: string;
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const contentIds: string[] = [];
  const campaignIds: string[] = [];
  const dealIds: string[] = [];
  const suffix = Date.now();
  const password = 'CreativeLaunch123!';

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
      where: { code: { startsWith: 'marketing.' } },
    });
    const makeRole = async (name: string, codes: string[]) => {
      const role = await prisma.role.create({
        data: {
          name: `${name}_${suffix}`,
          permissions: {
            create: permissions
              .filter(({ code }) => codes.includes(code))
              .map(({ id: permissionId }) => ({ permissionId })),
          },
        },
      });
      roleIds.push(role.id);
      return role;
    };
    const creatorRole = await makeRole('CREATIVE_CREATOR', [
      'marketing.deal.view',
      'marketing.deal.create',
      'marketing.deal.edit',
      'marketing.deal.submit',
      'marketing.content.view',
      'marketing.content.create',
      'marketing.content.edit',
      'marketing.content.version.create',
      'marketing.content.submit_review',
      'marketing.content.comment',
    ]);
    const managerRole = await makeRole(
      'CREATIVE_MANAGER',
      permissions.map(({ code }) => code),
    );
    const salesRole = await makeRole('CREATIVE_SALES', [
      'marketing.deal.sales_view',
    ]);
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'Marketing' },
    });
    const hash = await bcrypt.hash(password, 4);
    const makeUser = async (kind: string, roleId: string) => {
      const user = await prisma.user.create({
        data: {
          email: `${kind}-${suffix}@test.local`,
          passwordHash: hash,
          firstName: kind,
          lastName: 'Creative',
          departmentId: department.id,
          roles: { create: { roleId } },
        },
      });
      userIds.push(user.id);
      return user;
    };
    const creator = await makeUser('creator', creatorRole.id);
    const manager = await makeUser('manager', managerRole.id);
    const sales = await makeUser('sales', salesRole.id);
    creatorId = creator.id;
    const login = (email: string) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
    creatorToken = (await login(creator.email).expect(200)).body.accessToken;
    managerToken = (await login(manager.email).expect(200)).body.accessToken;
    salesToken = (await login(sales.email).expect(200)).body.accessToken;
  });

  it('creates concurrency-safe Campaign and Content codes', async () => {
    const deal = await createDeal();
    dealId = deal.id;
    dealIds.push(dealId);
    await request(app.getHttpServer())
      .post(`/marketing/deals/${dealId}/submit-approval`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/deals/${dealId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/deals/${dealId}/go-live`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const [a, b] = await Promise.all([
      createCampaign('Dubai Push A'),
      createCampaign('Dubai Push B'),
    ]);
    campaignId = a.id;
    campaignIds.push(a.id, b.id);
    expect(a.campaignCode).toMatch(/^CMP-\d{4}-\d{6}$/);
    expect(b.campaignCode).not.toBe(a.campaignCode);
    const [first, second] = await Promise.all([
      createContent('Dubai Summer Reel'),
      createContent('Dubai Backup Story'),
    ]);
    contentId = first.id;
    contentIds.push(first.id, second.id);
    expect(first.contentCode).toMatch(/^CONTENT-\d{4}-\d{6}$/);
    expect(second.contentCode).not.toBe(first.contentCode);
  });

  it('preserves V1 changes and approves V2 before READY and LIVE', async () => {
    await request(app.getHttpServer())
      .patch(`/marketing/content/${contentId}/stage`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ stage: 'LIVE' })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/marketing/content/${contentId}/stage`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ stage: 'CREATING' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/marketing/content/${contentId}/stage`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ stage: 'READY' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/versions`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        fileName: 'dubai-v1.png',
        fileType: 'image/png',
        storageKey: `creative/${suffix}/v1.png`,
        caption: 'Dubai from £699',
      })
      .expect(201)
      .expect(({ body }) => expect(body.versionNumber).toBe(1));
    const firstApproval = await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/submit-review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/marketing/content/${contentId}/stage`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ stage: 'CREATING' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/marketing/approvals/${firstApproval.body.id}/approve`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/marketing/approvals/${firstApproval.body.id}/request-changes`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ comment: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/marketing/approvals/${firstApproval.body.id}/request-changes`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ comment: 'Add baggage details and make the price clearer.' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/versions`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        fileName: 'dubai-v2.png',
        fileType: 'image/png',
        storageKey: `creative/${suffix}/v2.png`,
        caption: 'Dubai £699 · 23kg baggage',
      })
      .expect(201)
      .expect(({ body }) => expect(body.versionNumber).toBe(2));
    const secondApproval = await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/submit-review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/approvals/${secondApproval.body.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const ready = await prisma.marketingContent.findUniqueOrThrow({
      where: { id: contentId },
      include: { currentVersion: true, approvals: true, versions: true },
    });
    expect(ready.stage).toBe('READY');
    expect(ready.currentVersion?.versionNumber).toBe(2);
    expect(ready.versions).toHaveLength(2);
    expect(ready.approvals.map((x) => x.status)).toEqual(
      expect.arrayContaining(['CHANGES_REQUESTED', 'APPROVED']),
    );
    await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/go-live`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/go-live`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body.stage).toBe('LIVE'));
  });

  it('flags connected LIVE and READY creative after material Deal changes', async () => {
    await request(app.getHttpServer())
      .patch(`/marketing/deals/${dealId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ price: 749, changeReason: 'Supplier price changed.' })
      .expect(200);
    expect(
      (
        await prisma.marketingContent.findUniqueOrThrow({
          where: { id: contentId },
        })
      ).reviewRequired,
    ).toBe(true);
    expect(
      await prisma.notification.count({
        where: { type: 'CONNECTED_DEAL_CHANGED', entityId: contentId },
      }),
    ).toBeGreaterThan(0);
    await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/versions`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ caption: 'Dubai £749 · 23kg baggage' })
      .expect(201);
    const approval = await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/submit-review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/approvals/${approval.body.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    expect(
      (
        await prisma.marketingContent.findUniqueOrThrow({
          where: { id: contentId },
        })
      ).stage,
    ).toBe('READY');
    await request(app.getHttpServer())
      .patch(`/marketing/deals/${dealId}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        baggage: '30kg',
        changeReason: 'Supplier baggage allowance changed.',
      })
      .expect(200);
    const flagged = await prisma.marketingContent.findUniqueOrThrow({
      where: { id: contentId },
    });
    expect(flagged.stage).toBe('READY');
    expect(flagged.reviewRequired).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: 'MarketingContent',
          entityId: contentId,
          action: 'MARKETING_CONTENT_DEAL_REVIEW_REQUIRED',
        },
      }),
    ).toBe(2);
  });

  it('requires a rejection reason and preserves rejected version history', async () => {
    const content = await createContent('Rejected Creative');
    contentIds.push(content.id);
    await request(app.getHttpServer())
      .patch(`/marketing/content/${content.id}/stage`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ stage: 'CREATING' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/marketing/content/${content.id}/versions`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ copyText: 'Rejected draft copy' })
      .expect(201);
    const approval = await request(app.getHttpServer())
      .post(`/marketing/content/${content.id}/submit-review`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/approvals/${approval.body.id}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ comment: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/marketing/approvals/${approval.body.id}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ comment: 'Not aligned with campaign direction.' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/marketing/content/${content.id}/stage`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ stage: 'READY' })
      .expect(409);
    const detail = await request(app.getHttpServer())
      .get(`/marketing/content/${content.id}`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .expect(200);
    expect(detail.body.stage).toBe('IDEA');
    expect(detail.body.versions).toHaveLength(1);
    expect(detail.body.approvals[0].status).toBe('REJECTED');
    await request(app.getHttpServer())
      .patch(`/marketing/content/${content.id}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ title: 'Forbidden' })
      .expect(403);
  });

  async function createDeal() {
    return (
      await request(app.getHttpServer())
        .post('/marketing/deals')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          title: 'Dubai Creative Deal',
          destination: 'Dubai',
          departureLocation: 'London',
          travelStartDate: future(30).slice(0, 10),
          travelEndDate: future(37).slice(0, 10),
          price: 699,
          currency: 'GBP',
          baggage: '23kg',
          keyTerms: 'Subject to availability.',
          expiryAt: future(20),
        })
        .expect(201)
    ).body;
  }
  async function createCampaign(name: string) {
    return (
      await request(app.getHttpServer())
        .post('/marketing/campaigns')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          name,
          objective: 'Promote Dubai offer',
          ownerUserId: creatorId,
          dealId,
        })
        .expect(201)
    ).body;
  }
  async function createContent(title: string) {
    return (
      await request(app.getHttpServer())
        .post('/marketing/content')
        .set('Authorization', `Bearer ${creatorToken}`)
        .send({
          title,
          description: 'Creative workflow test',
          contentType: 'REEL',
          campaignId,
          dealId,
          assignedUserId: creatorId,
          deadline: future(5).slice(0, 10),
          priority: 'HIGH',
        })
        .expect(201)
    ).body;
  }

  afterAll(async () => {
    if (prisma) {
      await prisma.notification.deleteMany({
        where: {
          OR: [
            { userId: { in: userIds } },
            { entityId: { in: [...contentIds, ...dealIds] } },
          ],
        },
      });
      await prisma.integrationEvent.deleteMany({
        where: { internalEntityId: { in: dealIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entityType: 'MarketingContent', entityId: { in: contentIds } },
            { entityType: 'MarketingDeal', entityId: { in: dealIds } },
          ],
        },
      });
      await prisma.marketingContentComment.deleteMany({
        where: { contentId: { in: contentIds } },
      });
      await prisma.marketingPublication.deleteMany({
        where: { contentId: { in: contentIds } },
      });
      await prisma.marketingContentApproval.deleteMany({
        where: { contentId: { in: contentIds } },
      });
      await prisma.marketingContent.updateMany({
        where: { id: { in: contentIds } },
        data: { currentVersionId: null },
      });
      await prisma.marketingContentVersion.deleteMany({
        where: { contentId: { in: contentIds } },
      });
      await prisma.marketingContent.deleteMany({
        where: { id: { in: contentIds } },
      });
      await prisma.marketingCampaign.deleteMany({
        where: { id: { in: campaignIds } },
      });
      await prisma.marketingDeal.deleteMany({ where: { id: { in: dealIds } } });
      await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: roleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });
});
function future(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString();
}
