import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/campaign.dto';

@Controller('marketing/campaigns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}
  @Get() @Permissions('marketing.content.view') list() {
    return this.campaigns.list();
  }
  @Get(':id') @Permissions('marketing.content.view') findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.campaigns.findOne(id);
  }
  @Post() @Permissions('marketing.content.create') create(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.campaigns.create(dto, user.id);
  }
}
