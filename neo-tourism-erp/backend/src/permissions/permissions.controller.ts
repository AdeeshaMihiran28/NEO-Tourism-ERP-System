import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { PermissionsService } from './permissions.service';

@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @Permissions('role.view')
  findAll() {
    return this.permissionsService.findAll();
  }

  @Post()
  @Permissions('role.manage')
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.create(dto);
  }
}
