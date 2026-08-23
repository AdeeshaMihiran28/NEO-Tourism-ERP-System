import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { getRequestMetadata } from '../../common/request-metadata';
import { WebsiteLeadDto } from './dto/website-lead.dto';
import { WebsiteLeadsService } from './website-leads.service';

@Controller('integrations/website/leads')
export class WebsiteLeadsController {
  constructor(private readonly websiteLeads: WebsiteLeadsService) {}
  @Post()
  receive(
    @Body() dto: WebsiteLeadDto,
    @Headers('x-webhook-secret') secret: string | undefined,
    @Req() request: Request,
  ) {
    return this.websiteLeads.receive(dto, secret, getRequestMetadata(request));
  }
}
