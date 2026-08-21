import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadsService } from './leads.service';

@Controller('leads')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @Permissions('lead.create')
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.create(dto, user.id);
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
  ) {
    return this.leadsService.claim(id, user.id);
  }

  @Patch(':id/status')
  @Permissions('lead.change_status')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeadStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.updateStatus(id, dto, user);
  }

  @Post(':id/notes')
  @Permissions('lead.note.create')
  createNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateLeadNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.createNote(id, dto, user);
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
  ) {
    return this.leadsService.update(id, dto, user);
  }
}
