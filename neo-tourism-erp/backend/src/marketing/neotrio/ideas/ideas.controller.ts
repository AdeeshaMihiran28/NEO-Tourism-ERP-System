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
import type { AuthenticatedUser } from '../../../auth/auth.types';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/guards/permissions.guard';
import { getRequestMetadata } from '../../../common/request-metadata';
import { CreateIdeaDto, IdeaQueryDto, UpdateIdeaDto } from '../dto/neotrio.dto';
import { IdeasService } from './ideas.service';

@Controller('marketing/neotrio/ideas')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}
  @Get() @Permissions('marketing.neotrio.idea.view') list(
    @Query() query: IdeaQueryDto,
  ) {
    return this.ideas.list(query);
  }
  @Get(':id') @Permissions('marketing.neotrio.idea.view') get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.ideas.get(id);
  }
  @Post() @Permissions('marketing.neotrio.idea.create') create(
    @Body() dto: CreateIdeaDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ideas.create(dto, actor.id, getRequestMetadata(request));
  }
  @Patch(':id') @Permissions('marketing.neotrio.idea.edit') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateIdeaDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ideas.update(id, dto, actor.id, getRequestMetadata(request));
  }
  @Post(':id/shortlist')
  @Permissions('marketing.neotrio.idea.manage')
  shortlist(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ideas.shortlist(id, actor.id, getRequestMetadata(request));
  }
  @Post(':id/accept') @Permissions('marketing.neotrio.idea.manage') accept(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ideas.accept(id, actor.id, getRequestMetadata(request));
  }
  @Post(':id/archive') @Permissions('marketing.neotrio.idea.manage') archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ideas.archive(id, actor.id, getRequestMetadata(request));
  }
  @Post(':id/convert-production')
  @Permissions('marketing.neotrio.production.create')
  convert(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.ideas.convert(id, actor.id, getRequestMetadata(request));
  }
}
