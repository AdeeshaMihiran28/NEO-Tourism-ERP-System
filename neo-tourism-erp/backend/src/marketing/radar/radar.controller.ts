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
import {
  CreateOpportunityDto,
  OpportunityDealDto,
  OpportunityStatusDto,
} from './dto/radar.dto';
import { RadarService } from './radar.service';
import { IdeasService } from '../neotrio/ideas/ideas.service';
import { CreateIdeaFromOpportunityDto } from '../neotrio/dto/neotrio.dto';
@Controller('marketing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RadarController {
  constructor(
    private readonly radar: RadarService,
    private readonly ideas: IdeasService,
  ) {}
  @Get('radar') @Permissions('marketing.radar.view') get() {
    return this.radar.get();
  }
  @Post('opportunities') @Permissions('marketing.opportunity.create') create(
    @Body() dto: CreateOpportunityDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.radar.create(dto, u.id, getRequestMetadata(r));
  }
  @Patch('opportunities/:id/status')
  @Permissions('marketing.opportunity.manage')
  status(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OpportunityStatusDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.radar.status(id, dto, u.id, getRequestMetadata(r));
  }
  @Post('opportunities/:id/create-content')
  @Permissions('marketing.opportunity.manage', 'marketing.content.create')
  content(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.radar.createContent(id, u.id, getRequestMetadata(r));
  }
  @Post('opportunities/:id/create-campaign')
  @Permissions('marketing.opportunity.manage', 'marketing.content.create')
  campaign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.radar.createCampaign(id, u.id, getRequestMetadata(r));
  }
  @Post('opportunities/:id/link-deal')
  @Permissions('marketing.opportunity.manage', 'marketing.deal.view')
  deal(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: OpportunityDealDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.radar.linkDeal(id, dto, u.id, getRequestMetadata(r));
  }
  @Post('opportunities/:id/create-neotrio-idea')
  @Permissions('marketing.opportunity.manage', 'marketing.neotrio.idea.create')
  neoTrioIdea(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateIdeaFromOpportunityDto,
    @CurrentUser() u: AuthenticatedUser,
    @Req() r: Request,
  ) {
    return this.ideas.createFromOpportunity(
      id,
      dto,
      u.id,
      getRequestMetadata(r),
    );
  }
}
