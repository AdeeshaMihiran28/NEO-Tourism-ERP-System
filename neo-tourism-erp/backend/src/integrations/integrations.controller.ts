import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { IntegrationProviderType } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { getRequestMetadata } from '../common/request-metadata';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { IntegrationsService } from './integrations.service';
import { TelephonyService } from './telephony/telephony.service';

@Controller('integrations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly telephony: TelephonyService,
  ) {}

  @Get('status') @Permissions('integration.view') status() {
    return this.integrations.status();
  }
  @Patch(':type') @Permissions('integration.manage') update(
    @Param('type', new ParseEnumPipe(IntegrationProviderType))
    type: IntegrationProviderType,
    @Body() dto: UpdateIntegrationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.integrations.update(
      type,
      dto.isEnabled,
      user.id,
      getRequestMetadata(request),
    );
  }
  @Post('telephony/leads/:leadId/call') @Permissions('lead.view') call(
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.telephony.makeCall(leadId, user.id);
  }
  @Get('telephony/calls') @Permissions('integration.view') calls() {
    return this.telephony.callLogs();
  }
}
