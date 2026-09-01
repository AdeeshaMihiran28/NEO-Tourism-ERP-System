/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('NEO STUDIO (e2e)', () => {
  let app: INestApplication<App>,
    prisma: PrismaService,
    managerToken: string,
    viewerToken: string;
  let managerId: string,
    viewerId: string,
    managerRoleId: string,
    viewerRoleId: string;
  let ideaId: string, productionId: string, contentId: string, assetId: string;
  const suffix = Date.now(),
    password = 'NeoStudio123!';

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
    const staleUsers = await prisma.user.findMany({
      where: { email: { startsWith: 'neotrio-' } },
      select: { id: true },
    });
    const staleIds = staleUsers.map(({ id }) => id);
    if (staleIds.length) {
      await prisma.notification.deleteMany({
        where: { userId: { in: staleIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: staleIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: staleIds } } });
    }
    await prisma.role.deleteMany({
      where: {
        OR: [
          { name: { startsWith: 'NEOTRIO_MANAGER_' } },
          { name: { startsWith: 'NEOTRIO_VIEWER_' } },
        ],
      },
    });
    const permissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'marketing.' } },
    });
    const managerRole = await prisma.role.create({
      data: {
        name: `NEOTRIO_MANAGER_${suffix}`,
        permissions: {
          create: permissions.map(({ id }) => ({ permissionId: id })),
        },
      },
    });
    managerRoleId = managerRole.id;
    const viewerPermissions = permissions.filter(({ code }) =>
      ['marketing.neotrio.view', 'marketing.neotrio.character.view'].includes(
        code,
      ),
    );
    const viewerRole = await prisma.role.create({
      data: {
        name: `NEOTRIO_VIEWER_${suffix}`,
        permissions: {
          create: viewerPermissions.map(({ id }) => ({ permissionId: id })),
        },
      },
    });
    viewerRoleId = viewerRole.id;
    const department = await prisma.department.findUniqueOrThrow({
        where: { name: 'Marketing' },
      }),
      passwordHash = await bcrypt.hash(password, 4);
    const manager = await prisma.user.create({
      data: {
        email: `neotrio-manager-${suffix}@test.local`,
        passwordHash,
        firstName: 'NeoTrio',
        lastName: 'Manager',
        departmentId: department.id,
        roles: { create: { roleId: managerRoleId } },
      },
    });
    managerId = manager.id;
    const viewer = await prisma.user.create({
      data: {
        email: `neotrio-viewer-${suffix}@test.local`,
        passwordHash,
        firstName: 'NeoTrio',
        lastName: 'Viewer',
        departmentId: department.id,
        roles: { create: { roleId: viewerRoleId } },
      },
    });
    viewerId = viewer.id;
    const login = async (email: string) =>
      (
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email, password })
          .expect(200)
      ).body.accessToken as string;
    managerToken = await login(manager.email);
    viewerToken = await login(viewer.email);
  });

  it('seeds Ricky, Flip and Oli and protects guideline changes', async () => {
    const response = await request(app.getHttpServer())
      .get('/marketing/neotrio/characters')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(response.body.map((x: { code: string }) => x.code).sort()).toEqual([
      'FLIP',
      'OLI',
      'RICKY',
    ]);
    await request(app.getHttpServer())
      .patch(`/marketing/neotrio/characters/${response.body[0].id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ shortDescription: 'Blocked' })
      .expect(403);
  });

  it('versions and approves a Character Vault asset', async () => {
    const chars = await prisma.neoTrioCharacter.findMany({
      orderBy: { code: 'asc' },
    });
    const ricky = chars.find(({ code }) => code === 'RICKY')!;
    const uploaded = await request(app.getHttpServer())
      .post(`/marketing/neotrio/characters/${ricky.id}/assets`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        assetType: 'CHARACTER_REFERENCE',
        title: `Ricky Test ${suffix}`,
        fileName: 'ricky.png',
        storageKey: `neotrio/test/${suffix}/ricky.png`,
        mimeType: 'image/png',
        fileSize: 1200,
      })
      .expect(201);
    assetId = uploaded.body.id;
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/character-assets/${assetId}/submit-approval`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/character-assets/${assetId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ isMasterAsset: true })
      .expect(201);
    const v2 = await request(app.getHttpServer())
      .post(`/marketing/neotrio/characters/${ricky.id}/assets`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        assetType: 'CHARACTER_REFERENCE',
        title: `Ricky Test ${suffix}`,
        fileName: 'ricky-v2.png',
        storageKey: `neotrio/test/${suffix}/ricky-v2.png`,
        mimeType: 'image/png',
        fileSize: 1300,
        previousAssetId: assetId,
      })
      .expect(201);
    expect(v2.body.version).toBe(2);
    expect(
      await prisma.neoTrioCharacterAsset.count({
        where: { versionGroupKey: uploaded.body.versionGroupKey },
      }),
    ).toBe(2);
  });

  it('creates, tags, accepts and idempotently converts an idea', async () => {
    const characters = await prisma.neoTrioCharacter.findMany({
      where: { code: { in: ['RICKY', 'FLIP'] } },
    });
    const created = await request(app.getHttpServer())
      .post('/marketing/neotrio/ideas')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        title: `Dubai Airport Tip ${suffix}`,
        description: 'Ricky and Flip explain an airport travel tip.',
        ideaType: 'TRAVEL_IDEA',
        priority: 'HIGH',
        destination: 'Dubai',
        characterIds: characters.map(({ id }) => id),
      })
      .expect(201);
    ideaId = created.body.id;
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/ideas/${ideaId}/shortlist`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/ideas/${ideaId}/accept`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    const first = await request(app.getHttpServer())
      .post(`/marketing/neotrio/ideas/${ideaId}/convert-production`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    productionId = first.body.id;
    const second = await request(app.getHttpServer())
      .post(`/marketing/neotrio/ideas/${ideaId}/convert-production`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    expect(second.body.id).toBe(productionId);
    expect(await prisma.neoTrioProduction.count({ where: { ideaId } })).toBe(1);
  });

  it('enforces workflow and synchronizes Greenlight rework and approval', async () => {
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/production/${productionId}/stage`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ stage: 'PUBLISHED' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/production/${productionId}/stage`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ stage: 'SCRIPT' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/production/${productionId}/stage`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ stage: 'READY' })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/production/${productionId}/scripts`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ title: 'Script V1', scriptText: 'Scene one.' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/production/${productionId}/stage`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ stage: 'PRODUCTION' })
      .expect(201);
    const linked = await request(app.getHttpServer())
      .post(`/marketing/neotrio/production/${productionId}/link-content`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    contentId = linked.body.marketingContentId;
    await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/versions`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        fileName: 'v1.mp4',
        fileType: 'video/mp4',
        fileSize: 2048,
        storageKey: `marketing/${suffix}/v1.mp4`,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/production/${productionId}/stage`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ stage: 'REVIEW' })
      .expect(201);
    const approval1 = await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/submit-review`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/approvals/${approval1.body.id}/request-changes`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ comment: 'Create V2.' })
      .expect(201);
    expect(
      (
        await prisma.neoTrioProduction.findUniqueOrThrow({
          where: { id: productionId },
        })
      ).stage,
    ).toBe('PRODUCTION');
    await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/versions`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        fileName: 'v2.mp4',
        fileType: 'video/mp4',
        fileSize: 4096,
        storageKey: `marketing/${suffix}/v2.mp4`,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/production/${productionId}/stage`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ stage: 'REVIEW' })
      .expect(201);
    const approval2 = await request(app.getHttpServer())
      .post(`/marketing/content/${contentId}/submit-review`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/marketing/approvals/${approval2.body.id}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(201);
    expect(
      (
        await prisma.neoTrioProduction.findUniqueOrThrow({
          where: { id: productionId },
        })
      ).stage,
    ).toBe('READY');
    expect(
      await prisma.marketingContentVersion.count({ where: { contentId } }),
    ).toBe(2);
  });

  it('publishes idempotently into the library without fake external verification', async () => {
    const first = await request(app.getHttpServer())
      .post(`/marketing/neotrio/production/${productionId}/publish`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ channel: 'NEOTRIO' })
      .expect(201);
    expect(first.body.externalPublicationVerification).toBe('NOT_VERIFIED');
    await request(app.getHttpServer())
      .post(`/marketing/neotrio/production/${productionId}/publish`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ channel: 'NEOTRIO' })
      .expect(201);
    expect(
      await prisma.neoTrioLibraryItem.count({ where: { productionId } }),
    ).toBe(1);
    const performance = await request(app.getHttpServer())
      .get('/marketing/neotrio/performance')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect(performance.body.externalEngagement.status).toBeDefined();
  });

  afterAll(async () => {
    if (!prisma || !app) return;
    if (productionId)
      await prisma.neoTrioLibraryItem.deleteMany({ where: { productionId } });
    if (productionId)
      await prisma.neoTrioProduction.deleteMany({
        where: { id: productionId },
      });
    if (ideaId) await prisma.neoTrioIdea.deleteMany({ where: { id: ideaId } });
    if (contentId)
      await prisma.marketingContent.deleteMany({ where: { id: contentId } });
    if (assetId) {
      const asset = await prisma.neoTrioCharacterAsset.findUnique({
        where: { id: assetId },
      });
      if (asset)
        await prisma.neoTrioCharacterAsset.deleteMany({
          where: { versionGroupKey: asset.versionGroupKey },
        });
    }
    await prisma.notification.deleteMany({
      where: { userId: { in: [managerId, viewerId].filter(Boolean) } },
    });
    await prisma.auditLog.deleteMany({
      where: { actorId: { in: [managerId, viewerId].filter(Boolean) } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [managerId, viewerId].filter(Boolean) } },
    });
    await prisma.role.deleteMany({
      where: { id: { in: [managerRoleId, viewerRoleId].filter(Boolean) } },
    });
    await app.close();
  });
});
