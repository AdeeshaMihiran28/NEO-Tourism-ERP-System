import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import {
  CreateSalesSignalDto,
  PulseQueryDto,
  SalesSignalQueryDto,
  UpdateSalesSignalDto,
} from './dto/pulse.dto';
import { PulseService } from './pulse.service';
import { SalesSignalsService } from './services/sales-signals.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('marketing')
export class PulseController {
  constructor(
    private readonly pulse: PulseService,
    private readonly signals: SalesSignalsService,
  ) {}
  @Get('pulse') @Permissions('marketing.pulse.view') get(
    @Query() query: PulseQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pulse.get(query.period, user);
  }
  @Post('sales-signals')
  @Permissions('marketing.sales_signal.create')
  createSignal(
    @Body() dto: CreateSalesSignalDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.signals.create(dto, user.id, getRequestMetadata(req));
  }
  @Get('sales-signals') @Permissions('marketing.sales_signal.view') listSignals(
    @Query() query: SalesSignalQueryDto,
  ) {
    return this.signals.list(query);
  }
  @Patch('sales-signals/:id')
  @Permissions('marketing.sales_signal.manage')
  updateSignal(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSalesSignalDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.signals.update(id, dto, user.id, getRequestMetadata(req));
  }
}
