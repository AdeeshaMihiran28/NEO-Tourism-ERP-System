import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../auth/auth.types';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/guards/permissions.guard';
import { PerformanceQueryDto } from '../dto/neotrio.dto';
import { PerformanceService } from './performance.service';

@Controller('marketing/neotrio/performance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}
  @Get() @Permissions('marketing.neotrio.performance.view') get(
    @Query() query: PerformanceQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.performance.get(query, user);
  }
}
