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
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { getRequestMetadata } from '../../common/request-metadata';
import { CreateSeriesDto, UpdateSeriesDto } from './dto/neotrio.dto';
import { NeoTrioService } from './neotrio.service';
@Controller('marketing/neotrio')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NeoTrioController {
  constructor(private readonly studio: NeoTrioService) {}
  @Get() @Permissions('marketing.neotrio.view') home() {
    return this.studio.home();
  }
  @Get('series') @Permissions('marketing.neotrio.production.view') series() {
    return this.studio.series();
  }
  @Post('series') @Permissions('marketing.neotrio.production.create') create(
    @Body() d: CreateSeriesDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.studio.createSeries(d, u.id, getRequestMetadata(r));
  }
  @Patch('series/:id') @Permissions('marketing.neotrio.production.edit') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: UpdateSeriesDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.studio.updateSeries(id, d, u.id, getRequestMetadata(r));
  }
}
