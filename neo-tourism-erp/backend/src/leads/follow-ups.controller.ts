import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CancelFollowUpDto } from './dto/cancel-follow-up.dto';
import { CreateFollowUpDto } from './dto/create-follow-up.dto';
import { UpdateFollowUpDto } from './dto/update-follow-up.dto';
import { FollowUpsService } from './services/follow-ups.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Post('leads/:id/follow-ups')
  @Permissions('followup.create')
  create(
    @Param('id', new ParseUUIDPipe()) leadId: string,
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.followUpsService.create(
      leadId,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Get('leads/:id/follow-ups')
  @Permissions('followup.view')
  findForLead(
    @Param('id', new ParseUUIDPipe()) leadId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.followUpsService.findForLead(leadId, user);
  }

  @Get('follow-ups/summary')
  @Permissions('followup.view')
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.followUpsService.getSummary(user);
  }

  @Patch('follow-ups/:id')
  @Permissions('followup.edit')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.followUpsService.update(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('follow-ups/:id/complete')
  @Permissions('followup.complete')
  complete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.followUpsService.complete(
      id,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('follow-ups/:id/cancel')
  @Permissions('followup.edit')
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelFollowUpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.followUpsService.cancel(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }
}
