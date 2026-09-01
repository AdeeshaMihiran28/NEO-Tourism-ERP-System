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
import {
  AssignProductionDto,
  CreateProductionAssetDto,
  CreateProductionDto,
  CreateScriptDto,
  LinkContentDto,
  ProductionQueryDto,
  ProductionStageDto,
  PublishProductionDto,
  UpdateProductionDto,
} from '../dto/neotrio.dto';
import { ProductionService } from './production.service';
@Controller('marketing/neotrio/production')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductionController {
  constructor(private readonly production: ProductionService) {}
  @Get('board') @Permissions('marketing.neotrio.production.view') board(
    @Query() q: ProductionQueryDto,
  ) {
    return this.production.board(q);
  }
  @Get(':id') @Permissions('marketing.neotrio.production.view') get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.production.get(id);
  }
  @Post() @Permissions('marketing.neotrio.production.create') create(
    @Body() d: CreateProductionDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.production.create(d, u.id, getRequestMetadata(r));
  }
  @Patch(':id') @Permissions('marketing.neotrio.production.edit') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: UpdateProductionDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.production.update(id, d, u.id, getRequestMetadata(r));
  }
  @Post(':id/assign')
  @Permissions('marketing.neotrio.production.assign')
  assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: AssignProductionDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.production.assign(id, d, u.id, getRequestMetadata(r));
  }
  @Post(':id/stage') @Permissions('marketing.neotrio.production.edit') stage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: ProductionStageDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.production.stage(id, d, u.id, getRequestMetadata(r));
  }
  @Post(':id/scripts') @Permissions('marketing.neotrio.production.edit') script(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: CreateScriptDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.production.addScript(id, d, u.id, getRequestMetadata(r));
  }
  @Post(':id/assets') @Permissions('marketing.neotrio.asset.upload') asset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: CreateProductionAssetDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.production.addAsset(id, d, u.id, getRequestMetadata(r));
  }
  @Get(':id/approved-references')
  @Permissions('marketing.neotrio.character.view')
  refs(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.production.approvedReferences(id);
  }
  @Post(':id/link-content')
  @Permissions('marketing.neotrio.production.edit', 'marketing.content.create')
  link(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: LinkContentDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.production.linkContent(id, d, u.id, getRequestMetadata(r));
  }
  @Post(':id/publish')
  @Permissions('marketing.neotrio.production.edit', 'marketing.content.publish')
  publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() d: PublishProductionDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.production.publish(id, d, u.id, getRequestMetadata(r));
  }
}
