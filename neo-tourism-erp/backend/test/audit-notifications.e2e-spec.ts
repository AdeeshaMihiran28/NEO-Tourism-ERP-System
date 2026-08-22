import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginBody {
  accessToken: string;
  user: { id: string };
}

interface NotificationBody {
  data: Array<{ id: string; userId: string; isRead: boolean }>;
  unreadCount: number;
}

interface AuditBody {
  data: Array<{
    action: string;
    oldValues: unknown;
    newValues: unknown;
    metadata: unknown;
    actorUserId: string;
  }>;
  pagination: { total: number };
}

describe('Audit and notifications foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auditService: AuditService;
  let adminToken: string;
  let adminId: string;
  let limitedToken: string;
  let limitedUserId: string;
  let limitedRoleId: string;
  let adminNotificationId: string;
  let otherNotificationId: string;
  const createdNotificationIds: string[] = [];

  const suffix = Date.now();
  const auditAction = `SYSTEM_TEST_${suffix}`;
  const limitedEmail = `notification-user-${suffix}@example.com`;
  const limitedPassword = 'NotificationTestPassword123!';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  beforeAll(async () => {
    if (!adminPassword) throw new Error('SEED_ADMIN_PASSWORD is required.');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    auditService = app.get(AuditService);

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    const adminBody = adminLogin.body as LoginBody;
    adminToken = adminBody.accessToken;
    adminId = adminBody.user.id;

    const role = await prisma.role.create({
      data: { name: `NOTIFICATION_USER_${suffix}` },
    });
    limitedRoleId = role.id;
    const department = await prisma.department.findUniqueOrThrow({
      where: { name: 'Sales' },
    });
    const limitedUser = await prisma.user.create({
      data: {
        email: limitedEmail,
        passwordHash: await bcrypt.hash(limitedPassword, 4),
        firstName: 'Notification',
        lastName: 'User',
        departmentId: department.id,
        roles: { create: { roleId: limitedRoleId } },
      },
    });
    limitedUserId = limitedUser.id;
    const limitedLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: limitedEmail, password: limitedPassword })
      .expect(200);
    limitedToken = (limitedLogin.body as LoginBody).accessToken;

    const own = await prisma.notification.create({
      data: {
        userId: adminId,
        type: 'SYSTEM',
        title: 'System check',
        message: 'Admin-only notification.',
      },
    });
    adminNotificationId = own.id;
    createdNotificationIds.push(own.id);
    const second = await prisma.notification.create({
      data: {
        userId: adminId,
        type: 'GENERAL',
        title: 'Second check',
        message: 'Used by mark all.',
      },
    });
    createdNotificationIds.push(second.id);
    const other = await prisma.notification.create({
      data: {
        userId: limitedUserId,
        type: 'GENERAL',
        title: 'Private notification',
        message: 'Only the limited user may read this.',
      },
    });
    otherNotificationId = other.id;
    createdNotificationIds.push(other.id);

    await auditService.log({
      actorUserId: adminId,
      entityType: 'User',
      entityId: adminId,
      action: auditAction,
      oldValues: { firstName: 'Before', unchanged: 'same' },
      newValues: {
        firstName: 'After',
        unchanged: 'same',
        password: 'must-not-be-stored',
        accessToken: 'must-not-be-stored',
      },
      metadata: {
        reason: 'Automated test',
        nested: { apiKey: 'must-not-be-stored', safe: true },
      },
      requestMetadata: {
        ipAddress: '127.0.0.1',
        userAgent: 'audit-e2e-test',
      },
    });
  });

  it('returns and filters audit records for audit.view users', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit')
      .query({ action: auditAction, actorUserId: adminId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = response.body as AuditBody;
    expect(body.pagination.total).toBe(1);
    expect(body.data[0]).toMatchObject({
      action: auditAction,
      actorUserId: adminId,
      oldValues: { firstName: 'Before' },
      newValues: { firstName: 'After' },
    });
    expect(JSON.stringify(body.data[0])).not.toMatch(
      /must-not-be-stored|password|accessToken|apiKey/,
    );
    expect(body.data[0].metadata).toMatchObject({
      reason: 'Automated test',
      nested: { safe: true },
    });
  });

  it('denies audit access without audit.view', async () => {
    await request(app.getHttpServer())
      .get('/audit')
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(403);
  });

  it('returns only the current user notifications', async () => {
    const response = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = response.body as NotificationBody;
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: adminNotificationId, userId: adminId }),
      ]),
    );
    expect(body.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: otherNotificationId }),
      ]),
    );
  });

  it('cannot mark another user notification as read', async () => {
    await request(app.getHttpServer())
      .patch(`/notifications/${otherNotificationId}/read`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    await expect(
      prisma.notification.findUniqueOrThrow({
        where: { id: otherNotificationId },
        select: { isRead: true },
      }),
    ).resolves.toEqual({ isRead: false });
  });

  it('marks one notification and then all own notifications as read', async () => {
    await request(app.getHttpServer())
      .patch(`/notifications/${adminNotificationId}/read`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect(({ body }: { body: { isRead: boolean; readAt: string } }) => {
        expect(body.isRead).toBe(true);
        expect(body.readAt).toBeTruthy();
      });

    await request(app.getHttpServer())
      .patch('/notifications/read-all')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const unread = await request(app.getHttpServer())
      .get('/notifications')
      .query({ isRead: false })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((unread.body as NotificationBody).unreadCount).toBe(0);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { action: auditAction } });
    await prisma.notification.deleteMany({
      where: { id: { in: createdNotificationIds } },
    });
    if (limitedUserId) {
      await prisma.user.deleteMany({ where: { id: limitedUserId } });
    }
    if (limitedRoleId) {
      await prisma.role.deleteMany({ where: { id: limitedRoleId } });
    }
    if (app) await app.close();
  });
});
