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
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { getRequestMetadata } from '../common/request-metadata';
import { SaleSubmissionQueryDto } from './dto/sale-submission-query.dto';
import { UpdateSaleSubmissionDto } from './dto/update-sale-submission.dto';
import { SalesService } from './sales.service';

@Controller('sale-submissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesSubmissionsController {
  constructor(private readonly salesService: SalesService) {}

  @Get('my')
  @Permissions('sale.view_own')
  findMine(
    @Query() query: SaleSubmissionQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.findMine(user.id, query);
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('sale.edit_own')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSaleSubmissionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.salesService.update(id, dto, user, getRequestMetadata(request));
  }

  @Post(':id/submit')
  @Permissions('sale.submit')
  submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.salesService.submit(id, user, getRequestMetadata(request));
  }

  @Post(':id/accept')
  @Permissions('admin.sale.accept')
  accept(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.salesService.accept(id, user, getRequestMetadata(request));
  }
}

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminSalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('sales-queue')
  @Permissions('admin.sale_queue.view')
  findQueue(@Query() query: SaleSubmissionQueryDto) {
    return this.salesService.findAdminQueue(query);
  }
}
