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
  AccountsQueueQueryDto,
  CreateAdjustmentDto,
  CreateDiscrepancyDto,
  CreatePassengerPaymentDto,
  CreateSupplierPaymentDto,
  DiscrepancyQueryDto,
  ResolveDiscrepancyDto,
  UpdatePassengerPaymentDto,
  UpdateReconciliationDto,
  UpdateSupplierPaymentDto,
} from './dto/accounts.dto';
import { BookingFinanceService } from './services/booking-finance.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountsController {
  constructor(private readonly finance: BookingFinanceService) {}

  @Get('accounts/reconciliation-queue')
  @Permissions('finance.view')
  queue(@Query() query: AccountsQueueQueryDto) {
    return this.finance.queue(query);
  }

  @Get('accounts/summary')
  @Permissions('finance.view')
  dashboard() {
    return this.finance.dashboard();
  }

  @Get('accounts/reconciled')
  @Permissions('finance.view')
  reconciled(@Query() query: AccountsQueueQueryDto) {
    return this.finance.reconciled(query);
  }

  @Get('accounts/discrepancies')
  @Permissions('finance.view')
  discrepancies(@Query() query: DiscrepancyQueryDto) {
    return this.finance.discrepancies(query);
  }

  @Get('bookings/:id/financial-summary')
  @Permissions('finance.view')
  financialSummary(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.finance.financialSummary(id);
  }

  @Get('bookings/:id/reconciliation')
  @Permissions('finance.view')
  reconciliation(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.finance.getReconciliation(id);
  }

  @Post('bookings/:id/reconciliation/start')
  @Permissions('finance.reconcile')
  start(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.start(id, user, getRequestMetadata(request));
  }

  @Patch('bookings/:id/reconciliation')
  @Permissions('finance.reconcile')
  updateReconciliation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateReconciliationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.updateReconciliation(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('bookings/:id/reconciliation/complete')
  @Permissions('finance.reconcile')
  complete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.complete(id, user, getRequestMetadata(request));
  }

  @Post('bookings/:id/reconciliation/discrepancies')
  @Permissions('finance.discrepancy.manage')
  createDiscrepancy(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateDiscrepancyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.createDiscrepancy(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('reconciliation-discrepancies/:id/resolve')
  @Permissions('finance.discrepancy.manage')
  resolveDiscrepancy(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolveDiscrepancyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.resolveDiscrepancy(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Get('bookings/:id/passenger-payments')
  @Permissions('finance.view')
  passengerPayments(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.finance.listPassengerPayments(id);
  }

  @Post('bookings/:id/passenger-payments')
  @Permissions('finance.payment.create')
  createPassengerPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreatePassengerPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.createPassengerPayment(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Patch('passenger-payments/:id')
  @Permissions('finance.payment.create')
  updatePassengerPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePassengerPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.updatePassengerPayment(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('passenger-payments/:id/verify')
  @Permissions('finance.payment.verify')
  verifyPassengerPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.verifyPassengerPayment(
      id,
      user,
      getRequestMetadata(request),
    );
  }

  @Get('bookings/:id/supplier-payments')
  @Permissions('finance.view')
  supplierPayments(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.finance.listSupplierPayments(id);
  }

  @Post('bookings/:id/supplier-payments')
  @Permissions('finance.payment.create')
  createSupplierPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateSupplierPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.createSupplierPayment(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Patch('supplier-payments/:id')
  @Permissions('finance.payment.create')
  updateSupplierPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSupplierPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.updateSupplierPayment(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('supplier-payments/:id/verify')
  @Permissions('finance.payment.verify')
  verifySupplierPayment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.verifySupplierPayment(
      id,
      user,
      getRequestMetadata(request),
    );
  }

  @Get('bookings/:id/adjustments')
  @Permissions('finance.view')
  adjustments(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.finance.listAdjustments(id);
  }

  @Post('bookings/:id/adjustments')
  @Permissions('finance.adjustment.create')
  createAdjustment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.createAdjustment(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('booking-adjustments/:id/approve')
  @Permissions('finance.adjustment.approve')
  approveAdjustment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.finance.approveAdjustment(
      id,
      user,
      getRequestMetadata(request),
    );
  }
}
