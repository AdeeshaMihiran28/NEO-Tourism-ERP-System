import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../auth.types';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const buildContext = (permissions: string[]) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { permissions } as AuthenticatedUser,
        }),
      }),
    }) as unknown as ExecutionContext;

  it('allows a user with every required permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['user.view']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(buildContext(['user.view']))).toBe(true);
  });

  it('denies a user without a required permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['user.view']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(buildContext(['department.view']))).toBe(false);
  });
});
