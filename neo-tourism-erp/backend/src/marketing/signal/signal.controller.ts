import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { getRequestMetadata } from '../../common/request-metadata';
import { ManualAttributionDto, SignalQueryDto } from './dto/signal.dto';
import { SignalService } from './signal.service';
import { AttributionService } from './services/attribution.service';

@Controller('marketing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SignalController {
  constructor(
    private readonly signal: SignalService,
    private readonly attribution: AttributionService,
  ) {}
  @Get('signal') @Permissions('marketing.signal.view') get(
    @Query() query: SignalQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.signal.get(query, user);
  }
  @Get('signal/management')
  @Permissions('marketing.signal.management')
  management(
    @Query() query: SignalQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.signal.management(query, user);
  }
  @Post('attribution/manual')
  @Permissions('marketing.attribution.manage')
  manual(
    @Body() dto: ManualAttributionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.attribution.manual(dto, user, getRequestMetadata(req));
  }
  @Get('attribution/lead/:leadId')
  @Permissions('marketing.attribution.view')
  lead(@Param('leadId', new ParseUUIDPipe()) leadId: string) {
    return this.attribution.listForLead(leadId);
  }
}
