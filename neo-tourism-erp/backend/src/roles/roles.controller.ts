import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
import { CreateRoleDto } from './dto/create-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Permissions('role.view')
  findAll() {
    return this.rolesService.findAll();
  }

  @Post()
  @Permissions('role.manage')
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.rolesService.create(dto, user, getRequestMetadata(request));
  }

  @Patch(':id')
  @Permissions('role.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.rolesService.update(id, dto, user, getRequestMetadata(request));
  }

  @Put(':id/permissions')
  @Permissions('role.manage')
  setPermissions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.rolesService.setPermissions(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }
}
