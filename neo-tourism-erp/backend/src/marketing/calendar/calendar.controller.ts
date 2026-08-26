import {
  Body,
  Controller,
  Get,
  Param,
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
  CalendarQueryDto,
  CreateCalendarEntryDto,
  RescheduleCalendarEntryDto,
  UpdateCalendarEntryDto,
} from './dto/calendar.dto';
import { MarketingAlertsService } from './services/marketing-alerts.service';
import { MarketingCalendarService } from './services/marketing-calendar.service';

@Controller('marketing/calendar')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CalendarController {
  constructor(
    private readonly calendar: MarketingCalendarService,
    private readonly alerts: MarketingAlertsService,
  ) {}
  @Get() @Permissions('marketing.calendar.view') findAll(
    @Query() query: CalendarQueryDto,
  ) {
    return this.calendar.findAll(query);
  }
  @Get('alerts') @Permissions('marketing.alert.view') getAlerts() {
    return this.alerts.getAlerts();
  }
  @Post() @Permissions('marketing.calendar.create') create(
    @Body() dto: CreateCalendarEntryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.calendar.create(dto, user.id, getRequestMetadata(req));
  }
  @Patch(':id/reschedule')
  @Permissions('marketing.calendar.reschedule')
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleCalendarEntryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.calendar.reschedule(id, dto, user.id, getRequestMetadata(req));
  }
  @Patch(':id') @Permissions('marketing.calendar.edit') update(
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEntryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.calendar.update(id, dto, user.id, getRequestMetadata(req));
  }
  @Post(':id/cancel') @Permissions('marketing.calendar.edit') cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.calendar.cancel(id, user.id, getRequestMetadata(req));
  }
}
