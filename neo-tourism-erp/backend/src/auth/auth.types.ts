import type { SafeUser } from '../common/user-response';

export interface JwtPayload {
  sub: string;
  email: string;
}

export type AuthenticatedUser = SafeUser;
