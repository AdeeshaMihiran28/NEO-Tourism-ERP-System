import type { Prisma } from '../../generated/prisma/client';

export const userAccessInclude = {
  department: true,
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

export type UserWithAccess = Prisma.UserGetPayload<{
  include: typeof userAccessInclude;
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

export function toSafeUser(user: UserWithAccess): SafeUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    department: user.department?.name ?? null,
    roles: user.roles.map(({ role }) => role.name).sort(),
    permissions: [
      ...new Set(
        user.roles.flatMap(({ role }) =>
          role.permissions.map(({ permission }) => permission.code),
        ),
      ),
    ].sort(),
  };
}
