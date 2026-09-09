import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
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
  CreateBankAccountDto,
  CreateBankStatementDto,
  CreateBankTransferDto,
  CreateManualBankTransactionDto,
  ImportStatementTransactionsDto,
  MatchBankTransactionDto,
  ReasonDto,
  UpdateBankAccountDto,
} from './dto/banking.dto';
import { BankingService } from './services/banking.service';

@Controller('banking')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BankingController {
  constructor(private readonly banking: BankingService) {}

  @Get('accounts')
  @Permissions('bank.account.view')
  accounts(
    @Query('activeOnly', new ParseBoolPipe({ optional: true }))
    activeOnly?: boolean,
  ) {
    return this.banking.listAccounts(activeOnly ?? true);
  }

  @Get('accounts/:id')
  @Permissions('bank.account.view')
  account(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.banking.getAccount(id);
  }

  @Post('accounts')
  @Permissions('bank.account.manage')
  createAccount(
    @Body() dto: CreateBankAccountDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.banking.createAccount(dto, user, getRequestMetadata(request));
  }

  @Patch('accounts/:id')
  @Permissions('bank.account.manage')
  updateAccount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBankAccountDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.banking.updateAccount(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Get('accounts/:id/transactions')
  @Permissions('bank.transaction.view')
  transactions(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.banking.listTransactions(id);
  }

  @Get('accounts/:id/balance')
  @Permissions('bank.transaction.view')
  balance(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.banking
      .balance(id)
      .then((calculatedBalance) => ({ calculatedBalance }));
  }

  @Post('accounts/:id/transactions')
  @Permissions('bank.transaction.manage')
  createTransaction(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateManualBankTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.banking.createManualTransaction(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('transfers')
  @Permissions('bank.transaction.manage')
  transfer(
    @Body() dto: CreateBankTransferDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.banking.transfer(dto, user, getRequestMetadata(request));
  }

  @Get('accounts/:id/statements')
  @Permissions('bank.reconciliation.view')
  statements(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.banking.listStatements(id);
  }

  @Post('statements')
  @Permissions('bank.reconciliation.perform')
  createStatement(
    @Body() dto: CreateBankStatementDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.banking.createStatement(dto, user, getRequestMetadata(request));
  }

  @Get('statements/:id')
  @Permissions('bank.reconciliation.view')
  statement(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.banking.getStatement(id);
  }

  @Post('statements/:id/transactions/import')
  @Permissions('bank.reconciliation.perform')
  importRows(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ImportStatementTransactionsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.banking.importStatementRows(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('statements/:id/auto-match')
  @Permissions('bank.reconciliation.perform')
  autoMatch(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.banking.autoMatch(id, user, getRequestMetadata(request));
  }

  @Post('statement-transactions/:id/match')
  @Permissions('bank.reconciliation.perform')
  match(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MatchBankTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.banking.match(id, dto, user, getRequestMetadata(request));
  }

  @Post('matches/:id/unmatch')
  @Permissions('bank.reconciliation.perform')
  unmatch(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.banking.unmatch(id, dto, user, getRequestMetadata(request));
  }

  @Post('statements/:id/finalize')
  @Permissions('bank.reconciliation.finalize')
  finalize(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.banking.finalize(id, user, getRequestMetadata(request));
  }

  @Post('statements/:id/reopen')
  @Permissions('bank.reconciliation.finalize')
  reopen(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.banking.reopen(id, dto, user, getRequestMetadata(request));
  }
}
