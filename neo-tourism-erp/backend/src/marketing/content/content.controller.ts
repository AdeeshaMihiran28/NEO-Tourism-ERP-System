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
import type { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { getRequestMetadata } from '../../common/request-metadata';
import { ContentService } from './content.service';
import {
  ApprovalQueryDto,
  AssignContentDto,
  BoardQueryDto,
  CreateCommentDto,
  CreateContentDto,
  CreateVersionDto,
  ReviewCommentDto,
  StageDto,
  UpdateContentDto,
} from './dto/content.dto';

@Controller('marketing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('content/board') @Permissions('marketing.content.view') board(
    @Query() query: BoardQueryDto,
  ) {
    return this.content.board(query);
  }
  @Get('content/options') @Permissions('marketing.content.create') options() {
    return this.content.options();
  }
  @Get('content/workload') @Permissions('marketing.content.assign') workload() {
    return this.content.workload();
  }
  @Post('content') @Permissions('marketing.content.create') create(
    @Body() dto: CreateContentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.content.create(dto, user.id, getRequestMetadata(req));
  }
  @Get('content/:id') @Permissions('marketing.content.view') get(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.content.get(id);
  }
  @Patch('content/:id') @Permissions('marketing.content.edit') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateContentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.content.update(id, dto, user.id, getRequestMetadata(req));
  }
  @Patch('content/:id/stage') @Permissions('marketing.content.edit') stage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StageDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.content.stage(id, dto, user.id, getRequestMetadata(req));
  }
  @Post('content/:id/assign') @Permissions('marketing.content.assign') assign(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignContentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.content.assign(id, dto, user.id, getRequestMetadata(req));
  }
  @Post('content/:id/versions')
  @Permissions('marketing.content.version.create')
  version(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateVersionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.content.addVersion(id, dto, user.id, getRequestMetadata(req));
  }
  @Get('content/:id/versions') @Permissions('marketing.content.view') versions(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.content.versions(id);
  }
  @Post('content/:id/submit-review')
  @Permissions('marketing.content.submit_review')
  submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.content.submitReview(id, user.id, getRequestMetadata(req));
  }
  @Post('content/:id/go-live') @Permissions('marketing.content.publish') live(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.content.goLive(id, user.id, getRequestMetadata(req));
  }
  @Post('content/:id/comments')
  @Permissions('marketing.content.comment')
  comment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.content.comment(id, dto, user.id);
  }

  @Get('approvals') @Permissions('marketing.approval.view') approvals(
    @Query() query: ApprovalQueryDto,
  ) {
    return this.content.approvals(query);
  }
  @Post('approvals/:id/approve')
  @Permissions('marketing.approval.approve')
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.content.approve(id, user.id, getRequestMetadata(req));
  }
  @Post('approvals/:id/request-changes')
  @Permissions('marketing.approval.request_changes')
  changes(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewCommentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.content.requestChanges(
      id,
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }
  @Post('approvals/:id/reject')
  @Permissions('marketing.approval.reject')
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewCommentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.content.reject(id, dto, user.id, getRequestMetadata(req));
  }
}
