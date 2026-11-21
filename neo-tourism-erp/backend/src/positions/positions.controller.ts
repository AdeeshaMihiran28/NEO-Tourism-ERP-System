import {
  Body,
  Controller,
  Delete,
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
  CreatePositionDto,
  CreatePositionMappingDto,
  PositionMappingsQueryDto,
  UpdatePositionDto,
  UpdatePositionMappingDto,
} from './dto/positions.dto';
import { PositionAccessService } from './position-access.service';

@Controller('positions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PositionsController {
  constructor(private readonly positions: PositionAccessService) {}

  @Get()
  listPositions() {
    return this.positions.positions();
  }

  @Post()
  @Permissions('hr.position.manage')
  createPosition(
    @Body() dto: CreatePositionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.positions.createPosition(dto, user.id, getRequestMetadata(req));
  }

  @Patch(':id')
  @Permissions('hr.position.manage')
  updatePosition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePositionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.positions.updatePosition(
      id,
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }

  @Delete(':id')
  @Permissions('hr.position.manage')
  deletePosition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.positions.deletePosition(id, user.id, getRequestMetadata(req));
  }

  @Post(':id/sync')
  @Permissions('role.manage')
  syncPosition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.positions.resyncPosition(id, user.id, getRequestMetadata(req));
  }

  @Get('mappings')
  @Permissions('role.view')
  mappings(@Query() query: PositionMappingsQueryDto) {
    return this.positions.mappings(query);
  }

  @Post('mappings')
  @Permissions('role.manage')
  createMapping(
    @Body() dto: CreatePositionMappingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.positions.createMapping(dto, user.id, getRequestMetadata(req));
  }

  @Patch('mappings/:id')
  @Permissions('role.manage')
  updateMapping(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePositionMappingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.positions.updateMapping(
      id,
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }

  @Delete('mappings/:id')
  @Permissions('role.manage')
  deleteMapping(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.positions.deleteMapping(id, user.id, getRequestMetadata(req));
  }
}
