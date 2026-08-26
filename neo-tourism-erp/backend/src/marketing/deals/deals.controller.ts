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
import { DealsService } from './deals.service';
import {
  CreateDealDto,
  DealQueryDto,
  DecisionDto,
  ScheduleDealDto,
  SuspendDealDto,
  UpdateDealChannelDto,
  UpdateDealDto,
} from './dto/deal.dto';
import { MarketingDealLifecycleService } from './marketing-deal-lifecycle.service';

@Controller('marketing/deals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DealsController {
  constructor(
    private readonly deals: DealsService,
    private readonly lifecycle: MarketingDealLifecycleService,
  ) {}

  @Get()
  @Permissions('marketing.deal.view')
  list(@Query() query: DealQueryDto) {
    return this.deals.list(query);
  }

  @Get('summary')
  @Permissions('marketing.deal.view')
  summary() {
    return this.deals.summary();
  }

  @Get('sales/available')
  @Permissions('marketing.deal.sales_view')
  salesAvailable() {
    return this.deals.salesAvailable();
  }

  @Get('sales/available/:id')
  @Permissions('marketing.deal.sales_view')
  salesAvailableOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.deals.salesAvailableOne(id);
  }

  @Post('lifecycle/evaluate')
  @Permissions('marketing.deal.publish')
  evaluateLifecycle() {
    return this.lifecycle.evaluateAllActiveDeals();
  }

  @Get(':id')
  @Permissions('marketing.deal.view')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.deals.get(id);
  }

  @Post()
  @Permissions('marketing.deal.create')
  create(
    @Body() dto: CreateDealDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.deals.create(dto, user.id, getRequestMetadata(req));
  }

  @Patch(':id')
  @Permissions('marketing.deal.edit')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDealDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.deals.update(id, dto, user.id, getRequestMetadata(req));
  }

  @Post(':id/submit-approval')
  @Permissions('marketing.deal.submit')
  submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.deals.submit(id, user.id, getRequestMetadata(req));
  }

  @Post(':id/approve')
  @Permissions('marketing.deal.approve')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.deals.approve(id, dto, user.id, getRequestMetadata(req));
  }

  @Post(':id/reject')
  @Permissions('marketing.deal.approve')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.deals.reject(id, dto, user.id, getRequestMetadata(req));
  }

  @Post(':id/schedule')
  @Permissions('marketing.deal.schedule')
  schedule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ScheduleDealDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.deals.schedule(id, dto, user.id, getRequestMetadata(req));
  }

  @Post(':id/go-live')
  @Permissions('marketing.deal.publish')
  goLive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.deals.goLive(id, user.id, getRequestMetadata(req));
  }

  @Post(':id/suspend')
  @Permissions('marketing.deal.suspend')
  suspend(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SuspendDealDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.deals.suspend(id, dto, user.id, getRequestMetadata(req));
  }

  @Patch(':id/channels')
  @Permissions('marketing.deal.channel.manage')
  channel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDealChannelDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.deals.updateChannel(id, dto, user.id, getRequestMetadata(req));
  }
}
