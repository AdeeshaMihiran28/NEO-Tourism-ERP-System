/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('NEO LAUNCH marketing deals (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let marketingToken: string;
  let managerToken: string;
  let salesToken: string;
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const dealIds: string[] = [];
  const suffix = Date.now();
  const password = 'MarketingLaunch123!';

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
    const createRole = async (name: string, codes: string[]) => {
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
    const marketingRole = await createRole('MARKETING_TEST', [
      'marketing.deal.view',
      'marketing.deal.create',
      'marketing.deal.edit',
      'marketing.deal.submit',
      'marketing.deal.channel.manage',
    ]);
    const managerRole = await createRole(
      'MARKETING_MANAGER_TEST',
      permissions.map(({ code }) => code),
    );
    const salesRole = await createRole('SALES_OFFERS_TEST', [
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
          lastName: 'Tester',
          departmentId: department.id,
          roles: { create: { roleId } },
        },
      });
      userIds.push(user.id);
      return user;
    };
    const marketing = await makeUser('marketing', marketingRole.id);
    const manager = await makeUser('marketing-manager', managerRole.id);
    const sales = await makeUser('sales-offers', salesRole.id);
    const login = (email: string) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
    marketingToken = (await login(marketing.email).expect(200)).body
      .accessToken as string;
    managerToken = (await login(manager.email).expect(200)).body
      .accessToken as string;
    salesToken = (await login(sales.email).expect(200)).body
      .accessToken as string;
  });

  const payload = (title: string, expiryHours = 240) => ({
    title,
    shortDescription: 'A controlled test offer',
    destination: 'Dubai',
    departureLocation: 'London Heathrow',
    travelStartDate: futureDate(30).slice(0, 10),
    travelEndDate: futureDate(37).slice(0, 10),
    price: 699.99,
    currency: 'GBP',
    baggage: '23kg',
    keyTerms: 'Subject to availability.',
    expiryAt: new Date(Date.now() + expiryHours * 3600000).toISOString(),
  });

  async function createDeal(title: string, expiryHours = 240) {
    const response = await request(app.getHttpServer())
      .post('/marketing/deals')
      .set('Authorization', `Bearer ${marketingToken}`)
      .send(payload(title, expiryHours))
      .expect(201);
    dealIds.push(response.body.id as string);
    return response.body;
  }

  async function approveAndLive(id: string) {
    await request(app.getHttpServer())
      .post(`/marketing/deals/${id}/submit-approval`)
      .set('Authorization', `Bearer ${marketingToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/deals/${id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ comment: 'Approved for UAT' })
      .expect(201);
    return request(app.getHttpServer())
      .post(`/marketing/deals/${id}/go-live`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
  }

  it('creates concurrency-safe unique Deal Cards and supports draft editing', async () => {
    const [first, second] = await Promise.all([
      createDeal('Dubai launch A'),
      createDeal('Dubai launch B'),
    ]);
    expect(first.dealCode).toMatch(/^DEAL-\d{4}-\d{6}$/);
    expect(second.dealCode).not.toBe(first.dealCode);
    await request(app.getHttpServer())
      .patch(`/marketing/deals/${first.id}`)
      .set('Authorization', `Bearer ${marketingToken}`)
      .send({ shortDescription: 'Updated draft metadata' })
      .expect(200)
      .expect(({ body }) => expect(body.contentReviewRequired).toBe(false));
  });

  it('enforces approval permissions, scheduling, live state and sales-safe visibility', async () => {
    const deal = await createDeal('Approval journey');
    await request(app.getHttpServer())
      .post(`/marketing/deals/${deal.id}/submit-approval`)
      .set('Authorization', `Bearer ${marketingToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/deals/${deal.id}/approve`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/marketing/deals/${deal.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/marketing/deals/${deal.id}`)
      .set('Authorization', `Bearer ${marketingToken}`)
      .send({ shortDescription: 'Minor approved metadata' })
      .expect(200)
      .expect(({ body }) => expect(body.contentReviewRequired).toBe(false));
    await request(app.getHttpServer())
      .post(`/marketing/deals/${deal.id}/schedule`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ scheduledFor: new Date(Date.now() + 3600000).toISOString() })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('SCHEDULED'));
    await request(app.getHttpServer())
      .post(`/marketing/deals/${deal.id}/go-live`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('LIVE'));
    const sales = await request(app.getHttpServer())
      .get('/marketing/deals/sales/available')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);
    const visible = (
      sales.body as Array<{
        id: string;
        approvalStatus?: string;
        createdById?: string;
      }>
    ).find((item) => item.id === deal.id);
    expect(visible).toBeDefined();
    expect(visible?.approvalStatus).toBeUndefined();
    expect(visible?.createdById).toBeUndefined();
    await request(app.getHttpServer())
      .patch(`/marketing/deals/${deal.id}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ title: 'Forbidden' })
      .expect(403);
  });

  it('requires reasons for live material changes and removes suspended deals from Sales', async () => {
    const deal = await createDeal('Material and suspension');
    await approveAndLive(deal.id);
    await request(app.getHttpServer())
      .patch(`/marketing/deals/${deal.id}`)
      .set('Authorization', `Bearer ${marketingToken}`)
      .send({ price: 749 })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/marketing/deals/${deal.id}`)
      .set('Authorization', `Bearer ${marketingToken}`)
      .send({
        price: 749,
        baggage: '30kg',
        changeReason: 'Supplier fare and baggage changed.',
      })
      .expect(200)
      .expect(({ body }) => expect(body.contentReviewRequired).toBe(true));
    await request(app.getHttpServer())
      .post(`/marketing/deals/${deal.id}/suspend`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: '' })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/marketing/deals/${deal.id}/suspend`)
      .set('Authorization', `Bearer ${marketingToken}`)
      .send({ reason: 'Not allowed' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/marketing/deals/${deal.id}/suspend`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Supplier fare is no longer available.' })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('SUSPENDED'));
    const sales = await request(app.getHttpServer())
      .get('/marketing/deals/sales/available')
      .set('Authorization', `Bearer ${salesToken}`)
      .expect(200);
    expect(
      (sales.body as Array<{ id: string }>).some((item) => item.id === deal.id),
    ).toBe(false);
  });

  it('marks expiring once, expires internally, and records NOT_CONFIGURED website outcome', async () => {
    delete process.env.WEBSITE_DEALS_API_URL;
    delete process.env.WEBSITE_DEALS_API_TOKEN;
    const deal = await createDeal('Lifecycle expiry', 12);
    const live = await approveAndLive(deal.id);
    expect(live.body.status).toBe('EXPIRING');
    await request(app.getHttpServer())
      .post('/marketing/deals/lifecycle/evaluate')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post('/marketing/deals/lifecycle/evaluate')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    expect(
      await prisma.notification.count({
        where: { type: 'MARKETING_DEAL_EXPIRING', entityId: deal.id },
      }),
    ).toBe(1);
    await prisma.marketingDeal.update({
      where: { id: deal.id },
      data: { expiryAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .post('/marketing/deals/lifecycle/evaluate')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const expired = await prisma.marketingDeal.findUniqueOrThrow({
      where: { id: deal.id },
    });
    expect(expired.status).toBe('EXPIRED');
    expect(expired.websitePublicationStatus).toBe('NOT_CONFIGURED');
    expect(
      await prisma.integrationEvent.count({
        where: {
          internalEntityId: deal.id,
          eventType: 'MARKETING_DEAL_UNPUBLISH',
        },
      }),
    ).toBe(1);
  });

  it('keeps internal expiry correct when configured website removal fails', async () => {
    const deal = await createDeal('Website failure');
    await approveAndLive(deal.id);
    await prisma.marketingDeal.update({
      where: { id: deal.id },
      data: { expiryAt: new Date(Date.now() - 1000) },
    });
    process.env.WEBSITE_DEALS_API_URL = 'http://127.0.0.1:1';
    process.env.WEBSITE_DEALS_API_TOKEN = 'test-token';
    await request(app.getHttpServer())
      .post('/marketing/deals/lifecycle/evaluate')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const expired = await prisma.marketingDeal.findUniqueOrThrow({
      where: { id: deal.id },
    });
    expect(expired.status).toBe('EXPIRED');
    expect(expired.websitePublicationStatus).toBe('FAILED');
    expect(
      await prisma.integrationEvent.count({
        where: { internalEntityId: deal.id, status: 'FAILED' },
      }),
    ).toBeGreaterThan(0);
    delete process.env.WEBSITE_DEALS_API_URL;
    delete process.env.WEBSITE_DEALS_API_TOKEN;
  });

  it('calls the configured website adapter when an active deal expires', async () => {
    const deal = await createDeal('Website success');
    await approveAndLive(deal.id);
    await prisma.marketingDeal.update({
      where: { id: deal.id },
      data: { expiryAt: new Date(Date.now() - 1000) },
    });
    process.env.WEBSITE_DEALS_API_URL = 'https://website.test/api';
    process.env.WEBSITE_DEALS_API_TOKEN = 'test-token';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    await request(app.getHttpServer())
      .post('/marketing/deals/lifecycle/evaluate')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/deals/${deal.dealCode}`),
      expect.objectContaining({ method: 'DELETE' }),
    );
    const expired = await prisma.marketingDeal.findUniqueOrThrow({
      where: { id: deal.id },
    });
    expect(expired.status).toBe('EXPIRED');
    expect(expired.websitePublicationStatus).toBe('UNPUBLISHED');
    fetchMock.mockRestore();
    delete process.env.WEBSITE_DEALS_API_URL;
    delete process.env.WEBSITE_DEALS_API_TOKEN;
  });

  afterAll(async () => {
    delete process.env.WEBSITE_DEALS_API_URL;
    delete process.env.WEBSITE_DEALS_API_TOKEN;
    if (prisma) {
      await prisma.notification.deleteMany({
        where: {
          OR: [{ userId: { in: userIds } }, { entityId: { in: dealIds } }],
        },
      });
      await prisma.integrationEvent.deleteMany({
        where: {
          internalEntityType: 'MarketingDeal',
          internalEntityId: { in: dealIds },
        },
      });
      await prisma.auditLog.deleteMany({
        where: { entityType: 'MarketingDeal', entityId: { in: dealIds } },
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

function futureDate(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString();
}
