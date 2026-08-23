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
  AccessQueryDto,
  AssetQueryDto,
  AssignAssetDto,
  AssignTicketDto,
  CreateAccessRequestDto,
  CreateAssetDto,
  CreateTicketDto,
  ResolveTicketDto,
  ReturnAssetDto,
  ReviewAccessRequestDto,
  TicketQueryDto,
  UpdateAssetDto,
  UpdateTicketStatusDto,
} from './dto/it.dto';
import { ItService } from './it.service';

@Controller('it')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ItController {
  constructor(private readonly it: ItService) {}
  @Get('employees') @Permissions('it.asset.view') employees() {
    return this.it.employees();
  }
  @Get('offboarding') @Permissions('it.asset.view') offboarding() {
    return this.it.offboarding();
  }

  @Post('assets') @Permissions('it.asset.create') createAsset(
    @Body() dto: CreateAssetDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.createAsset(dto, user.id, getRequestMetadata(req));
  }
  @Get('assets') @Permissions('it.asset.view') assets(
    @Query() query: AssetQueryDto,
  ) {
    return this.it.assets(query);
  }
  @Get('assets/:id') @Permissions('it.asset.view') asset(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.it.asset(id);
  }
  @Patch('assets/:id') @Permissions('it.asset.edit') updateAsset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAssetDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.updateAsset(id, dto, user.id, getRequestMetadata(req));
  }
  @Post('assets/:id/assign') @Permissions('it.asset.assign') assignAsset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignAssetDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.assignAsset(id, dto, user.id, getRequestMetadata(req));
  }
  @Post('assets/:id/return') @Permissions('it.asset.assign') returnAsset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReturnAssetDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.returnAsset(id, dto, user.id, getRequestMetadata(req));
  }

  @Post('tickets') @Permissions('it.ticket.create') createTicket(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.createTicket(dto, user.id, getRequestMetadata(req));
  }
  @Get('tickets/my') @Permissions('it.ticket.view_own') myTickets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TicketQueryDto,
  ) {
    return this.it.myTickets(user.id, query);
  }
  @Get('tickets') @Permissions('it.ticket.view_all') tickets(
    @Query() query: TicketQueryDto,
  ) {
    return this.it.tickets(query);
  }
  @Get('tickets/:id') @Permissions('it.ticket.view_own') ticket(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.it.ticket(id, user);
  }
  @Post('tickets/:id/assign') @Permissions('it.ticket.manage') assignTicket(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.assignTicket(id, dto, user.id, getRequestMetadata(req));
  }
  @Patch('tickets/:id/status')
  @Permissions('it.ticket.manage')
  updateTicketStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.updateTicketStatus(
      id,
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }
  @Post('tickets/:id/resolve') @Permissions('it.ticket.manage') resolveTicket(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolveTicketDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.resolveTicket(id, dto, user.id, getRequestMetadata(req));
  }

  @Post('access-requests')
  @Permissions('it.access_request.create')
  createAccess(
    @Body() dto: CreateAccessRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.createAccessRequest(dto, user.id, getRequestMetadata(req));
  }
  @Get('access-requests/my') @Permissions('it.access_request.create') myAccess(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.it.myAccessRequests(user.id);
  }
  @Get('access-requests') @Permissions('it.access_request.view') access(
    @Query() query: AccessQueryDto,
  ) {
    return this.it.accessRequests(query);
  }
  @Post('access-requests/:id/approve')
  @Permissions('it.access_request.approve')
  approveAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewAccessRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.reviewAccess(
      id,
      'APPROVED',
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }
  @Post('access-requests/:id/reject')
  @Permissions('it.access_request.approve')
  rejectAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewAccessRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.reviewAccess(
      id,
      'REJECTED',
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }
  @Post('access-requests/:id/fulfil')
  @Permissions('it.access_request.fulfil')
  fulfilAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.it.fulfilAccess(id, user.id, getRequestMetadata(req));
  }
}
