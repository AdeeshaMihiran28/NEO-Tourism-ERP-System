import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { toSafeUser, userIdentityInclude } from '../../common/user-response';
import { jwtSecret } from '../../common/security-config';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: userIdentityInclude,
    });

    if (!user || !user.isActive || user.email !== payload.email) {
      throw new UnauthorizedException();
    }

    return toSafeUser(this.prisma, user);
  }
}
