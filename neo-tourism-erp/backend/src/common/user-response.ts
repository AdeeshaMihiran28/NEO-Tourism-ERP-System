import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export const userIdentityInclude = {
  department: true,
} satisfies Prisma.UserInclude;

export type UserWithIdentity = Prisma.UserGetPayload<{
  include: typeof userIdentityInclude;
}>;

export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  department: string | null;
  roles: string[];
  permissions: string[];
}

export async function toSafeUser(
  prisma: PrismaService,
  user: UserWithIdentity,
): Promise<SafeUser> {
  const roles = await prisma.role.findMany({
    where: { users: { some: { userId: user.id } } },
    select: { name: true },
    orderBy: { name: 'asc' },
  });
  const permissions = await prisma.permission.findMany({
    where: {
      roles: {
        some: {
          role: { users: { some: { userId: user.id } } },
        },
      },
    },
    select: { code: true },
    orderBy: { code: 'asc' },
  });

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    department: user.department?.name ?? null,
    roles: roles.map(({ name }) => name),
    permissions: permissions.map(({ code }) => code),
  };
}
