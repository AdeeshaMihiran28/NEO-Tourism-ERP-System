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
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { getRequestMetadata } from '../common/request-metadata';
import {
  AccountingReasonDto,
  ClosePeriodDto,
  CreateAccountingPeriodDto,
  CreateExchangeRateDto,
  CreateTaxCodeDto,
  PartyStatementQueryDto,
  ReportDateQueryDto,
  UpdateAccountingSettingDto,
  UpdateExchangeRateDto,
  UpdateTaxCodeDto,
} from './dto/accounting-controls.dto';
import { AccountingControlsService } from './services/accounting-controls.service';

@Controller('accounting')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountingControlsController {
  constructor(private readonly controls: AccountingControlsService) {}

  @Get('settings')
  @Permissions('accounting.settings.view')
  settings() {
    return this.controls.settings();
  }

  @Patch('settings')
  @Permissions('accounting.settings.manage')
  updateSettings(
    @Body() dto: UpdateAccountingSettingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.controls.updateSettings(dto, user, getRequestMetadata(req));
  }

  @Get('exchange-rates')
  @Permissions('fx.rate.view')
  rates() {
    return this.controls.listRates();
  }

  @Post('exchange-rates')
  @Permissions('fx.rate.manage')
  createRate(
    @Body() dto: CreateExchangeRateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.controls.createRate(dto, user, getRequestMetadata(req));
  }

  @Patch('exchange-rates/:id')
  @Permissions('fx.rate.manage')
  updateRate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateExchangeRateDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.controls.updateRate(id, dto, user, getRequestMetadata(req));
  }

  @Get('tax-codes')
  @Permissions('tax.code.view')
  taxCodes() {
    return this.controls.listTaxCodes();
  }

  @Post('tax-codes')
  @Permissions('tax.code.manage')
  createTaxCode(
    @Body() dto: CreateTaxCodeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.controls.createTaxCode(dto, user, getRequestMetadata(req));
  }

  @Patch('tax-codes/:id')
  @Permissions('tax.code.manage')
  updateTaxCode(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTaxCodeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.controls.updateTaxCode(id, dto, user, getRequestMetadata(req));
  }

  @Get('periods')
  @Permissions('accounting.period.view')
  periods() {
    return this.controls.listPeriods();
  }

  @Post('periods')
  @Permissions('accounting.period.manage')
  createPeriod(
    @Body() dto: CreateAccountingPeriodDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.controls.createPeriod(dto, user, getRequestMetadata(req));
  }

  @Get('periods/:id/validation')
  @Permissions('accounting.period.view')
  validation(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.controls.closeValidation(id);
  }

  @Post('periods/:id/start-closing')
  @Permissions('accounting.period.close')
  startClosing(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.controls.startClosing(id, user, getRequestMetadata(req));
  }

  @Post('periods/:id/close')
  @Permissions('accounting.period.close')
  close(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ClosePeriodDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.controls.closePeriod(
      id,
      dto.notes,
      user,
      getRequestMetadata(req),
    );
  }

  @Post('periods/:id/lock')
  @Permissions('accounting.period.close')
  lock(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.controls.lockPeriod(id, user, getRequestMetadata(req));
  }

  @Post('periods/:id/reopen')
  @Permissions('accounting.period.reopen')
  reopen(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AccountingReasonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.controls.reopenPeriod(
      id,
      dto.reason,
      user,
      getRequestMetadata(req),
    );
  }

  @Get('reports/profit-and-loss')
  @Permissions('report.pnl.view')
  profitAndLoss(@Query() query: ReportDateQueryDto) {
    return this.controls.profitAndLoss(query);
  }

  @Get('reports/balance-sheet')
  @Permissions('report.balance-sheet.view')
  balanceSheet(@Query() query: ReportDateQueryDto) {
    return this.controls.balanceSheet(query);
  }

  @Get('reports/cash-flow')
  @Permissions('report.cash-flow.view')
  cashFlow(@Query() query: ReportDateQueryDto) {
    return this.controls.cashFlow(query);
  }

  @Get('reports/tax-summary')
  @Permissions('report.tax.view')
  taxSummary(@Query() query: ReportDateQueryDto) {
    return this.controls.taxSummary(query);
  }

  @Get('reports/ar-ageing')
  @Permissions('report.audit.view')
  arAgeing(@Query() query: ReportDateQueryDto) {
    return this.controls.arAgeing(query);
  }

  @Get('reports/ap-ageing')
  @Permissions('report.audit.view')
  apAgeing(@Query() query: ReportDateQueryDto) {
    return this.controls.apAgeing(query);
  }

  @Get('reports/customer-statement')
  @Permissions('report.audit.view')
  customerStatement(@Query() query: PartyStatementQueryDto) {
    return this.controls.customerStatement(query.partyId, query);
  }

  @Get('reports/supplier-statement')
  @Permissions('report.audit.view')
  supplierStatement(@Query() query: PartyStatementQueryDto) {
    return this.controls.supplierStatement(query.partyId, query);
  }
}
