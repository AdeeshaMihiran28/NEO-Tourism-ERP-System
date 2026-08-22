import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FollowUpSchedulerService } from '../src/leads/services/follow-up-scheduler.service';
import { LeadAttentionService } from '../src/leads/services/lead-attention.service';

interface LoginBody {
  accessToken: string;
}

interface IdBody {
  id: string;
}

interface FollowUpBody extends IdBody {
  status: string;
  scheduledAt: string;
}

interface AttentionListBody {
  data: Array<{ id: string; isAttentionRequired: boolean }>;
}

describe('Follow-ups, callbacks and attention leads (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let attentionService: LeadAttentionService;
  let schedulerService: FollowUpSchedulerService;
  let agentAToken: string;
  let agentBToken: string;
  let managerToken: string;
  let agentAId: string;
  let agentBId: string;
  let managerId: string;
  let customerId: string;
  let futureLeadId: string;
  let neglectedLeadId: string;
  let missedLeadId: string;
  let reassignLeadId: string;
  let callbackId: string;
  let completedFollowUpId: string;
  let cancelledFollowUpId: string;
  let dueFollowUpId: string;

  const suffix = Date.now();
  const password = 'FollowUpAttentionPassword123!';
  const roleNames = [`FOLLOWUP_AGENT_${suffix}`, `FOLLOWUP_MANAGER_${suffix}`];
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
    attentionService = app.get(LeadAttentionService);
    schedulerService = app.get(FollowUpSchedulerService);

    const permissionCodes = [
      'lead.view',
      'lead.view_all',
      'lead.edit',
      'lead.change_status',
      'lead.note.create',
      'followup.view',
      'followup.create',
      'followup.edit',
      'followup.complete',
      'lead.attention.view',
      'lead.attention.manage',
      'lead.reassign',
    ];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });
    const agentCodes = permissionCodes.filter(
      (code) =>
        !['lead.view_all', 'lead.attention.manage', 'lead.reassign'].includes(
          code,
        ),
    );
    const agentRole = await prisma.role.create({
      data: {
        name: roleNames[0],
        permissions: {
          create: permissions
            .filter(({ code }) => agentCodes.includes(code))
            .map(({ id }) => ({ permissionId: id })),
        },
      },
    });
    const managerRole = await prisma.role.create({
      data: {
        name: roleNames[1],
        permissions: {
          create: permissions.map(({ id }) => ({ permissionId: id })),
        },
      },
    });
    const sales = await prisma.department.findUniqueOrThrow({
      where: { name: 'Sales' },
    });
    const passwordHash = await bcrypt.hash(password, 4);
    const agentA = await prisma.user.create({
      data: {
        email: `followup-a-${suffix}@example.com`,
        passwordHash,
        firstName: 'FollowUp',
        lastName: 'Agent A',
        departmentId: sales.id,
        roles: { create: { roleId: agentRole.id } },
      },
    });
    const agentB = await prisma.user.create({
      data: {
        email: `followup-b-${suffix}@example.com`,
        passwordHash,
        firstName: 'FollowUp',
        lastName: 'Agent B',
        departmentId: sales.id,
        roles: { create: { roleId: agentRole.id } },
      },
    });
    const manager = await prisma.user.create({
      data: {
        email: `followup-manager-${suffix}@example.com`,
        passwordHash,
        firstName: 'FollowUp',
        lastName: 'Manager',
        departmentId: sales.id,
        roles: { create: { roleId: managerRole.id } },
      },
    });
    agentAId = agentA.id;
    agentBId = agentB.id;
    managerId = manager.id;

    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      return (response.body as LoginBody).accessToken;
    };
    agentAToken = await login(agentA.email);
    agentBToken = await login(agentB.email);
    managerToken = await login(manager.email);

    const customer = await prisma.customer.create({
      data: {
        firstName: 'Attention',
        lastName: 'Passenger',
        email: `attention-passenger-${suffix}@example.com`,
        createdById: manager.id,
        updatedById: manager.id,
      },
    });
    customerId = customer.id;
    const staleAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const createLead = async (summary: string) =>
      prisma.lead.create({
        data: {
          customerId,
          assignedUserId: agentAId,
          assignedAt: staleAt,
          status: 'HANDLING',
          summary,
          createdById: managerId,
          lastMeaningfulActivityAt: staleAt,
        },
      });
    futureLeadId = (await createLead('Future callback exception')).id;
    neglectedLeadId = (await createLead('Neglected lead')).id;
    missedLeadId = (await createLead('Missed callback lead')).id;
    reassignLeadId = (await createLead('Manager reassignment lead')).id;
  });

  it('creates a future callback and prevents attention despite 4 days inactivity', async () => {
    const scheduledAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const response = await request(app.getHttpServer())
      .post(`/leads/${futureLeadId}/follow-ups`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({
        type: 'CALLBACK',
        scheduledAt: scheduledAt.toISOString(),
        note: 'Passenger asked us to call after payday.',
      })
      .expect(201);
    callbackId = (response.body as FollowUpBody).id;
    expect(response.body).toMatchObject({
      status: 'SCHEDULED',
      type: 'CALLBACK',
    });

    await attentionService.evaluateLeadAttention(futureLeadId);
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: futureLeadId },
    });
    expect(lead.isAttentionRequired).toBe(false);
    expect(lead.nextActionAt?.toISOString()).toBe(scheduledAt.toISOString());
  });

  it('lists and updates the scheduled callback', async () => {
    const list = await request(app.getHttpServer())
      .get(`/leads/${futureLeadId}/follow-ups`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: callbackId })]),
    );

    const changedAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    await request(app.getHttpServer())
      .patch(`/follow-ups/${callbackId}`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({ scheduledAt: changedAt.toISOString(), note: 'Updated callback.' })
      .expect(200)
      .expect(({ body }: { body: FollowUpBody }) => {
        expect(body.scheduledAt).toBe(changedAt.toISOString());
      });
  });

  it('creates and completes a follow-up as meaningful activity', async () => {
    const created = await request(app.getHttpServer())
      .post(`/leads/${futureLeadId}/follow-ups`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({
        type: 'GENERAL_FOLLOW_UP',
        scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        note: 'Review itinerary options.',
      })
      .expect(201);
    completedFollowUpId = (created.body as IdBody).id;
    const before = new Date();
    await request(app.getHttpServer())
      .post(`/follow-ups/${completedFollowUpId}/complete`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .expect(201)
      .expect(({ body }: { body: FollowUpBody }) => {
        expect(body.status).toBe('COMPLETED');
      });
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: futureLeadId },
    });
    expect(lead.lastMeaningfulActivityAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
  });

  it('creates and cancels a follow-up', async () => {
    const created = await request(app.getHttpServer())
      .post(`/leads/${futureLeadId}/follow-ups`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({
        type: 'EMAIL_FOLLOW_UP',
        scheduledAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        note: 'Email hotel shortlist.',
      })
      .expect(201);
    cancelledFollowUpId = (created.body as IdBody).id;
    await request(app.getHttpServer())
      .post(`/follow-ups/${cancelledFollowUpId}/cancel`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({ reason: 'Passenger already received the shortlist.' })
      .expect(201)
      .expect(({ body }: { body: FollowUpBody }) => {
        expect(body.status).toBe('CANCELLED');
      });
  });

  it('flags a neglected lead once and avoids duplicate notifications', async () => {
    await attentionService.evaluateLeadAttention(neglectedLeadId);
    await attentionService.evaluateLeadAttention(neglectedLeadId);
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: neglectedLeadId },
    });
    expect(lead).toMatchObject({
      isAttentionRequired: true,
      attentionReason: 'NO_ACTIVITY_3_DAYS',
    });
    await expect(
      prisma.notification.count({
        where: {
          userId: agentAId,
          entityId: neglectedLeadId,
          type: 'ATTENTION_LEAD',
        },
      }),
    ).resolves.toBe(1);
  });

  it('clears attention after a meaningful note', async () => {
    await request(app.getHttpServer())
      .post(`/leads/${neglectedLeadId}/notes`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({ content: 'Passenger confirmed they are still interested.' })
      .expect(201);
    await expect(
      prisma.lead.findUniqueOrThrow({
        where: { id: neglectedLeadId },
        select: { isAttentionRequired: true, attentionReason: true },
      }),
    ).resolves.toEqual({ isAttentionRequired: false, attentionReason: null });
  });

  it('marks an overdue callback missed, flags attention, and sends no duplicates', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const overdue = await prisma.followUp.create({
      data: {
        leadId: missedLeadId,
        assignedUserId: agentAId,
        createdById: agentAId,
        type: 'CALLBACK',
        scheduledAt: past,
        note: 'Overdue callback.',
      },
    });
    await schedulerService.processScheduledFollowUps();
    await schedulerService.processScheduledFollowUps();

    await expect(
      prisma.followUp.findUniqueOrThrow({
        where: { id: overdue.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'MISSED' });
    await expect(
      prisma.lead.findUniqueOrThrow({
        where: { id: missedLeadId },
        select: { isAttentionRequired: true, attentionReason: true },
      }),
    ).resolves.toEqual({
      isAttentionRequired: true,
      attentionReason: 'MISSED_CALLBACK',
    });
    await expect(
      prisma.notification.count({
        where: { entityId: missedLeadId, type: 'MISSED_CALLBACK' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.notification.count({
        where: { entityId: missedLeadId, type: 'ATTENTION_LEAD' },
      }),
    ).resolves.toBe(1);
  });

  it('sends only one callback-due notification', async () => {
    const due = await prisma.followUp.create({
      data: {
        leadId: futureLeadId,
        assignedUserId: agentAId,
        createdById: agentAId,
        type: 'CALLBACK',
        scheduledAt: new Date(Date.now() + 20 * 60 * 1000),
        note: 'Due notification test.',
      },
    });
    dueFollowUpId = due.id;
    await schedulerService.processScheduledFollowUps();
    await schedulerService.processScheduledFollowUps();
    await expect(
      prisma.notification.count({
        where: {
          userId: agentAId,
          entityId: futureLeadId,
          type: 'CALLBACK_DUE',
          metadata: { path: ['followUpId'], equals: due.id },
        },
      }),
    ).resolves.toBe(1);
  });

  it('denies follow-up access to another normal agent', async () => {
    await request(app.getHttpServer())
      .get(`/leads/${futureLeadId}/follow-ups`)
      .set('Authorization', `Bearer ${agentBToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/leads/${futureLeadId}/follow-ups`)
      .set('Authorization', `Bearer ${agentBToken}`)
      .send({
        type: 'CALLBACK',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        note: 'Unauthorized callback.',
      })
      .expect(403);
  });

  it('allows managers to see team attention leads', async () => {
    const response = await request(app.getHttpServer())
      .get('/leads/attention')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect((response.body as AttentionListBody).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: missedLeadId,
          isAttentionRequired: true,
        }),
      ]),
    );
  });

  it('allows manager reassignment with audit and notification', async () => {
    await attentionService.evaluateLeadAttention(reassignLeadId);
    await request(app.getHttpServer())
      .post(`/leads/${reassignLeadId}/reassign`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        newAssignedUserId: agentBId,
        reason: 'Lead inactive and requires follow-up.',
      })
      .expect(201)
      .expect(({ body }: { body: { assignedUserId: string } }) => {
        expect(body.assignedUserId).toBe(agentBId);
      });
    await expect(
      prisma.auditLog.count({
        where: { entityId: reassignLeadId, action: 'LEAD_REASSIGNED' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.notification.count({
        where: {
          userId: agentBId,
          entityId: reassignLeadId,
          type: 'LEAD_REASSIGNED',
        },
      }),
    ).resolves.toBe(1);
  });

  it('denies reassignment to normal sales users', async () => {
    await request(app.getHttpServer())
      .post(`/leads/${missedLeadId}/reassign`)
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({
        newAssignedUserId: agentBId,
        reason: 'Unauthorized reassignment attempt.',
      })
      .expect(403);
  });

  it('records all follow-up audit lifecycle events', async () => {
    const actions = await prisma.auditLog.findMany({
      where: {
        entityId: {
          in: [
            callbackId,
            completedFollowUpId,
            cancelledFollowUpId,
            dueFollowUpId,
          ].filter(Boolean),
        },
      },
      select: { action: true },
    });
    expect(actions.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'FOLLOW_UP_CREATED',
        'FOLLOW_UP_UPDATED',
        'FOLLOW_UP_COMPLETED',
        'FOLLOW_UP_CANCELLED',
      ]),
    );
  });

  afterAll(async () => {
    const userIds = [agentAId, agentBId, managerId].filter(Boolean);
    const leadIds = [
      futureLeadId,
      neglectedLeadId,
      missedLeadId,
      reassignLeadId,
    ].filter(Boolean);
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
    if (customerId)
      await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.role.deleteMany({ where: { name: { in: roleNames } } });
    if (app) await app.close();
  });
});
