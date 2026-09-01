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
import type { AuthenticatedUser } from '../../../auth/auth.types';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { Permissions } from '../../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../auth/guards/permissions.guard';
import { getRequestMetadata } from '../../../common/request-metadata';
import {
  ApproveCharacterAssetDto,
  CreateCharacterAssetDto,
  UpdateCharacterDto,
} from '../dto/neotrio.dto';
import { CharactersService } from './characters.service';

@Controller('marketing/neotrio')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CharactersController {
  constructor(private readonly characters: CharactersService) {}
  @Get('characters') @Permissions('marketing.neotrio.character.view') list() {
    return this.characters.list();
  }
  @Get('characters/:id') @Permissions('marketing.neotrio.character.view') get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.characters.get(id);
  }
  @Patch('characters/:id')
  @Permissions('marketing.neotrio.character.manage')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCharacterDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.characters.update(
      id,
      dto,
      actor.id,
      getRequestMetadata(request),
    );
  }
  @Get('characters/:id/assets')
  @Permissions('marketing.neotrio.character.view')
  assets(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.characters.assets(id);
  }
  @Post('characters/:id/assets')
  @Permissions('marketing.neotrio.asset.upload')
  createAsset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateCharacterAssetDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.characters.createAsset(
      id,
      dto,
      actor.id,
      getRequestMetadata(request),
    );
  }
  @Post('character-assets/:id/submit-approval')
  @Permissions('marketing.neotrio.asset.upload')
  submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.characters.submit(id, actor.id, getRequestMetadata(request));
  }
  @Post('character-assets/:id/approve')
  @Permissions('marketing.neotrio.asset.approve')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApproveCharacterAssetDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.characters.approve(
      id,
      dto,
      actor.id,
      getRequestMetadata(request),
    );
  }
  @Post('character-assets/:id/archive')
  @Permissions('marketing.neotrio.character.manage')
  archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.characters.archive(id, actor.id, getRequestMetadata(request));
  }
}
