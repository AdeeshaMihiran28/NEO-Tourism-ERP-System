import type { PrismaService } from '../prisma/prisma.service';
import { toSafeUser, type UserWithIdentity } from './user-response';

describe('toSafeUser', () => {
  it('loads roles and effective permissions directly', async () => {
    const prisma = {
      role: {
        findMany: jest.fn().mockResolvedValue([{ name: 'SALES' }]),
      },
      permission: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ code: 'lead.view' }, { code: 'lead.assign' }]),
      },
    } as unknown as PrismaService;
    const user = {
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: 'not-returned',
      firstName: 'Test',
      lastName: 'User',
      isActive: true,
      departmentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      department: null,
    } satisfies UserWithIdentity;

    await expect(toSafeUser(prisma, user)).resolves.toMatchObject({
      roles: ['SALES'],
      permissions: ['lead.view', 'lead.assign'],
    });
  });
});
