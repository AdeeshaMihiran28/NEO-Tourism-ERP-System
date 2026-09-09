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
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { ReassignLeadDto } from './dto/reassign-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsService } from './leads.service';
import { SalesService } from '../sales/sales.service';

@Controller('leads')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly salesService: SalesService,
  ) {}

  @Post()
  @Permissions('lead.create')
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.leadsService.create(dto, user.id, getRequestMetadata(request));
  }

  @Get('live')
  @Permissions('lead.view')
  findLive(@Query() query: LeadQueryDto) {
    return this.leadsService.findLive(query);
  }

  @Get('my')
  @Permissions('lead.view')
  findMine(
    @Query() query: LeadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.findMine(query, user.id);
  }

  @Get('attention')
  @Permissions('lead.attention.view')
  findAttention(
    @Query() query: LeadQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.findAttention(query, user);
  }

  @Get()
  @Permissions('lead.view_all')
  findAll(@Query() query: LeadQueryDto) {
    return this.leadsService.findAll(query);
  }

  @Post(':id/claim')
  @Permissions('lead.assign')
  claim(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.leadsService.claim(id, user.id, getRequestMetadata(request));
  }

  @Post(':id/reassign')
  @Permissions('lead.reassign')
  reassign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReassignLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.leadsService.reassign(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post(':id/sale-made')
  @Permissions('sale.create')
  startSaleMade(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.salesService.startSaleMade(
      id,
      user,
      getRequestMetadata(request),
    );
  }

  @Patch(':id/status')
  @Permissions('lead.change_status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeadStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.leadsService.updateStatus(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post(':id/notes')
  @Permissions('lead.note.create')
  createNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateLeadNoteDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.leadsService.createNote(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Get(':id')
  @Permissions('lead.view')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('lead.edit')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.leadsService.update(id, dto, user, getRequestMetadata(request));
  }
}
