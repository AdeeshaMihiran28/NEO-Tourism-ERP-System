import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { getRequestMetadata } from '../../common/request-metadata';
import { MetaService } from './meta.service';

@Controller('integrations/meta')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MetaController {
  constructor(private readonly meta: MetaService) {}
  @Get('status') @Permissions('integration.meta.view') status() {
    return this.meta.status();
  }
  @Post('sync') @Permissions('integration.meta.sync') sync(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.meta.sync(user.id, getRequestMetadata(req));
  }
}
