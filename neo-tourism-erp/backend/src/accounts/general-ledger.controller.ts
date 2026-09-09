import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccountingMappingType } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { getRequestMetadata } from '../common/request-metadata';
import {
  CreateGlAccountDto,
  CreateManualJournalDto,
  JournalQueryDto,
  JournalReasonDto,
  LedgerQueryDto,
  TrialBalanceQueryDto,
  UpdateAccountingMappingDto,
  UpdateGlAccountDto,
  UpdateManualJournalDto,
} from './dto/general-ledger.dto';
import { GeneralLedgerService } from './services/general-ledger.service';

@Controller('accounting')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class GeneralLedgerController {
  constructor(private readonly ledger: GeneralLedgerService) {}

  @Get('chart-of-accounts')
  @Permissions('gl.account.view')
  accounts(
    @Query('activeOnly', new ParseBoolPipe({ optional: true }))
    activeOnly?: boolean,
  ) {
    return this.ledger.listAccounts(activeOnly);
  }

  @Post('chart-of-accounts')
  @Permissions('gl.account.manage')
  createAccount(
    @Body() dto: CreateGlAccountDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ledger.createAccount(dto, user, getRequestMetadata(request));
  }

  @Patch('chart-of-accounts/:id')
  @Permissions('gl.account.manage')
  updateAccount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateGlAccountDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ledger.updateAccount(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Get('mappings')
  @Permissions('gl.account.view')
  mappings() {
    return this.ledger.listMappings();
  }

  @Patch('mappings/:type')
  @Permissions('gl.account.manage')
  updateMapping(
    @Param('type', new ParseEnumPipe(AccountingMappingType))
    type: AccountingMappingType,
    @Body() dto: UpdateAccountingMappingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ledger.updateMapping(
      type,
      dto.accountId,
      user,
      getRequestMetadata(request),
    );
  }

  @Get('journals')
  @Permissions('journal.view')
  journals(@Query() query: JournalQueryDto) {
    return this.ledger.listJournals(query);
  }

  @Get('journals/:id')
  @Permissions('journal.view')
  journal(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ledger.getJournal(id);
  }

  @Post('journals')
  @Permissions('journal.create')
  createJournal(
    @Body() dto: CreateManualJournalDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ledger.createManual(dto, user, getRequestMetadata(request));
  }

  @Patch('journals/:id')
  @Permissions('journal.create')
  updateJournal(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateManualJournalDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ledger.updateManual(id, dto, user, getRequestMetadata(request));
  }

  @Post('journals/:id/approve')
  @Permissions('journal.approve')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ledger.approve(id, user, getRequestMetadata(request));
  }

  @Post('journals/:id/reject')
  @Permissions('journal.approve')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: JournalReasonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ledger.reject(
      id,
      dto.reason,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('journals/:id/post')
  @Permissions('journal.post')
  post(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ledger.post(id, user, getRequestMetadata(request));
  }

  @Post('journals/:id/reverse')
  @Permissions('journal.reverse')
  reverse(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: JournalReasonDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ledger.reverse(
      id,
      dto.reason,
      user,
      getRequestMetadata(request),
    );
  }

  @Get('general-ledger')
  @Permissions('general-ledger.view')
  generalLedger(@Query() query: LedgerQueryDto) {
    return this.ledger.ledger(query);
  }

  @Get('trial-balance')
  @Permissions('trial-balance.view')
  trialBalance(@Query() query: TrialBalanceQueryDto) {
    return this.ledger.trialBalance(query);
  }
}
