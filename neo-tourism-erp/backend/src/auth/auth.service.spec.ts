jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const password = 'SecurePassword123!';
  const baseUser = {
    id: 'e4d81bc4-3520-4a3d-aabe-5a6629b0da44',
    email: 'user@example.com',
    passwordHash: '',
    firstName: 'Test',
    lastName: 'User',
    isActive: true,
    departmentId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    department: null,
    roles: [],
  };
  const findUnique = jest.fn();
  const signAsync = jest.fn().mockResolvedValue('signed-token');
  const prisma = {
    user: { findUnique },
  } as unknown as PrismaService;
  const jwtService = { signAsync } as unknown as JwtService;
  const service = new AuthService(prisma, jwtService);

  beforeAll(async () => {
    baseUser.passwordHash = await bcrypt.hash(password, 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs in an active user with a valid password', async () => {
    findUnique.mockResolvedValue(baseUser);

    await expect(
      service.login({ email: baseUser.email, password }),
    ).resolves.toMatchObject({
      accessToken: 'signed-token',
      user: { email: baseUser.email },
    });
    expect(signAsync).toHaveBeenCalledWith({
      sub: baseUser.id,
      email: baseUser.email,
    });
  });

  it('rejects an invalid password', async () => {
    findUnique.mockResolvedValue(baseUser);

    await expect(
      service.login({ email: baseUser.email, password: 'WrongPassword123!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an inactive user', async () => {
    findUnique.mockResolvedValue({ ...baseUser, isActive: false });

    await expect(
      service.login({ email: baseUser.email, password }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
