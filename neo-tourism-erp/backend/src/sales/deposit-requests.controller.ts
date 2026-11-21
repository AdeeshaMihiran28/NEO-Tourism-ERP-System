import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { DepositRequestsService } from './deposit-requests.service';
import {
  CreateDepositRequestDto,
  DecideDepositRequestDto,
} from './dto/deposit-request.dto';

@Controller('deposit-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DepositRequestsController {
  constructor(private readonly deposits: DepositRequestsService) {}

  @Get('my')
  @Permissions('deposit.request.view_own')
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.deposits.listMine(user.id);
  }

  @Get('pending')
  @Permissions('deposit.approval.view')
  listPending() {
    return this.deposits.listPending();
  }

  @Get('by-submission/:saleSubmissionId')
  findBySubmission(
    @Param('saleSubmissionId', new ParseUUIDPipe()) saleSubmissionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deposits.findBySubmission(saleSubmissionId, user);
  }

  @Post('submission/:saleSubmissionId')
  @Permissions('deposit.request.create')
  create(
    @Param('saleSubmissionId', new ParseUUIDPipe()) saleSubmissionId: string,
    @Body() dto: CreateDepositRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.deposits.create(
      saleSubmissionId,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post(':id/decision')
  @Permissions('deposit.approval.decide')
  decide(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DecideDepositRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.deposits.decide(id, dto, user, getRequestMetadata(request));
  }
}
