import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface LoginBody {
  accessToken: string;
}

interface IdBody {
  id: string;
}

interface LeadListBody {
  data: Array<{ id: string; customer?: { firstName: string } }>;
}

interface ConflictBody {
  message: string;
}

interface LeadDetailBody {
  activities: Array<{ type: string; description: string }>;
}

describe('Sales Lead Centre (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let agentAToken: string;
  let agentBToken: string;
  let managerToken: string;
  let agentAId: string;
  let agentBId: string;
  let managerId: string;
  let customerId: string;
  let leadId: string;
  let winningToken: string;
  let winningUserId: string;

  const suffix = Date.now();
  const password = 'SalesLeadTestPassword123!';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@local.test';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const roleNames = [`LEAD_AGENT_${suffix}`, `LEAD_MANAGER_${suffix}`];

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

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);

    const permissions = await prisma.permission.findMany({
      where: { code: { startsWith: 'lead.' } },
    });
    const agentCodes = [
      'lead.view',
      'lead.create',
      'lead.edit',
      'lead.assign',
      'lead.change_status',
      'lead.note.create',
    ];
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
    const [agentA, agentB, manager] = await Promise.all([
      prisma.user.create({
        data: {
          email: `agent-a-${suffix}@example.com`,
          passwordHash,
          firstName: 'Agent',
          lastName: 'Alpha',
          departmentId: sales.id,
          roles: { create: { roleId: agentRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          email: `agent-b-${suffix}@example.com`,
          passwordHash,
          firstName: 'Agent',
          lastName: 'Beta',
          departmentId: sales.id,
          roles: { create: { roleId: agentRole.id } },
        },
      }),
      prisma.user.create({
        data: {
          email: `manager-${suffix}@example.com`,
          passwordHash,
          firstName: 'Sales',
          lastName: 'Manager',
          departmentId: sales.id,
          roles: { create: { roleId: managerRole.id } },
        },
      }),
    ]);
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
    [agentAToken, agentBToken, managerToken] = await Promise.all([
      login(agentA.email),
      login(agentB.email),
      login(manager.email),
    ]);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: adminEmail },
    });
    const customer = await prisma.customer.create({
      data: {
        firstName: 'Lead',
        lastName: 'Passenger',
        email: `lead-passenger-${suffix}@example.com`,
        phone: `+9477${String(suffix).slice(-7)}`,
        customerType: 'REPEAT',
        createdById: admin.id,
        updatedById: admin.id,
      },
    });
    customerId = customer.id;
  });

  it('rejects a lead for an invalid customer', async () => {
    await request(app.getHttpServer())
      .post('/leads')
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({ customerId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
  });

  it('creates a new unassigned lead with activity and audit', async () => {
    const response = await request(app.getHttpServer())
      .post('/leads')
      .set('Authorization', `Bearer ${agentAToken}`)
      .send({
        customerId,
        source: 'Website',
        destination: 'Dubai',
        travelDate: '2026-09-10',
        summary: 'Family holiday enquiry',
      })
      .expect(201);
    leadId = (response.body as IdBody).id;
    expect(response.body).toMatchObject({
      status: 'NEW',
      assignedUserId: null,
    });
    await expect(
      prisma.leadActivity.count({
        where: { leadId, type: 'LEAD_CREATED' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: { entityId: leadId, action: 'LEAD_CREATED' },
      }),
    ).resolves.toBe(1);
  });

  it('returns the lead in the oldest-first live queue', async () => {
    const response = await request(app.getHttpServer())
      .get('/leads/live')
      .set('Authorization', `Bearer ${agentAToken}`)
      .expect(200);
    const liveLead = (response.body as LeadListBody).data.find(
      ({ id }) => id === leadId,
    );
    expect(liveLead?.customer?.firstName).toBe('Lead');
  });

  it('keeps authentication and permissions stable under concurrent dashboard requests', async () => {
    const paths = [
      '/leads/live?limit=1',
      '/leads/my?status=HANDLING&limit=1',
      '/leads/my?status=QUOTING&limit=1',
      '/leads/my?status=CALLBACK&limit=1',
      '/leads/my?status=GOING_TO_BOOK&limit=1',
    ];
    const responses = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        request(app.getHttpServer())
          .get(paths[index % paths.length])
          .set('Authorization', `Bearer ${agentAToken}`),
      ),
    );

    expect(responses.map(({ status }) => status)).toEqual(
      Array.from({ length: responses.length }, () => 200),
    );
  });

  it('allows only one of two simultaneous claims', async () => {
    const [claimA, claimB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/leads/${leadId}/claim`)
        .set('Authorization', `Bearer ${agentAToken}`),
      request(app.getHttpServer())
        .post(`/leads/${leadId}/claim`)
        .set('Authorization', `Bearer ${agentBToken}`),
    ]);
    expect([claimA.status, claimB.status].sort()).toEqual([201, 409]);
    winningToken = claimA.status === 201 ? agentAToken : agentBToken;
    winningUserId = claimA.status === 201 ? agentAId : agentBId;
    expect(
      ((claimA.status === 409 ? claimA : claimB).body as ConflictBody).message,
    ).toBe('Lead has already been assigned.');
  });

  it('returns only the current agent leads and rejects team access', async () => {
    const winner = await request(app.getHttpServer())
      .get('/leads/my')
      .set('Authorization', `Bearer ${winningToken}`)
      .expect(200);
    expect((winner.body as LeadListBody).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: leadId })]),
    );
    const loserToken = winningToken === agentAToken ? agentBToken : agentAToken;
    const loser = await request(app.getHttpServer())
      .get('/leads/my')
      .set('Authorization', `Bearer ${loserToken}`)
      .expect(200);
    expect((loser.body as LeadListBody).data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: leadId })]),
    );
    await request(app.getHttpServer())
      .get('/leads')
      .set('Authorization', `Bearer ${winningToken}`)
      .expect(403);
  });

  it('allows a manager to filter all team leads', async () => {
    const response = await request(app.getHttpServer())
      .get('/leads')
      .query({ assignedUserId: winningUserId, status: 'HANDLING' })
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    expect((response.body as LeadListBody).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: leadId })]),
    );
  });

  it('updates approved lead fields and records activity', async () => {
    await request(app.getHttpServer())
      .patch(`/leads/${leadId}`)
      .set('Authorization', `Bearer ${winningToken}`)
      .send({
        destination: 'Dubai and Abu Dhabi',
        salesNotes: 'Direct flight preferred.',
      })
      .expect(200)
      .expect(({ body }: { body: { destination: string } }) => {
        expect(body.destination).toBe('Dubai and Abu Dhabi');
      });
    await expect(
      prisma.leadActivity.count({ where: { leadId, type: 'LEAD_UPDATED' } }),
    ).resolves.toBe(1);
  });

  it('changes status and preserves old/new values', async () => {
    await request(app.getHttpServer())
      .patch(`/leads/${leadId}/status`)
      .set('Authorization', `Bearer ${winningToken}`)
      .send({ status: 'QUOTING' })
      .expect(200);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: leadId, action: 'LEAD_STATUS_CHANGED' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.oldValues).toMatchObject({ status: 'HANDLING' });
    expect(audit.newValues).toMatchObject({ status: 'QUOTING' });
  });

  it('adds a meaningful note and returns it in lead detail', async () => {
    await request(app.getHttpServer())
      .post(`/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${winningToken}`)
      .send({ content: 'Passenger requested Emirates options.' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${winningToken}`)
      .send({ content: '   ' })
      .expect(400);
    const detail = await request(app.getHttpServer())
      .get(`/leads/${leadId}`)
      .set('Authorization', `Bearer ${winningToken}`)
      .expect(200);
    expect((detail.body as LeadDetailBody).activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'NOTE_ADDED',
          description: 'Passenger requested Emirates options.',
        }),
      ]),
    );
  });

  it('returns not found for an unknown lead', async () => {
    await request(app.getHttpServer())
      .get('/leads/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(404);
  });

  afterAll(async () => {
    if (leadId) {
      await prisma.auditLog.deleteMany({ where: { entityId: leadId } });
      await prisma.lead.deleteMany({ where: { id: leadId } });
    }
    await prisma.auditLog.deleteMany({
      where: {
        actorId: { in: [agentAId, agentBId, managerId].filter(Boolean) },
      },
    });
    if (customerId)
      await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [agentAId, agentBId, managerId].filter(Boolean) } },
    });
    await prisma.role.deleteMany({ where: { name: { in: roleNames } } });
    if (app) await app.close();
  });
});
