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
import { CreateUserDto } from './dto/create-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetUserRolesDto } from './dto/set-user-roles.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Permissions('user.view')
  findAll() {
    return this.usersService.findAll();
  }

  @Get('access-options')
  @Permissions('user.view', 'user.manage_roles')
  accessOptions() {
    return this.usersService.accessOptions();
  }

  @Get(':id')
  @Permissions('user.view')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Permissions('user.create', 'user.manage_roles')
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.usersService.create(dto, user, getRequestMetadata(request));
  }

  @Patch(':id')
  @Permissions('user.edit')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.usersService.update(id, dto, user, getRequestMetadata(request));
  }

  @Patch(':id/roles')
  @Permissions('user.manage_roles')
  updateRoles(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.usersService.update(id, dto, user, getRequestMetadata(request));
  }

  @Patch(':id/status')
  @Permissions('user.edit')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.usersService.updateStatus(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Patch(':id/password')
  @Permissions('user.edit')
  resetPassword(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.usersService.resetPassword(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }
}
