import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CustomersService } from './customers.service';
import { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @Permissions('customer.view')
  findAll(@Query() query: CustomerQueryDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @Permissions('customer.view')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.customersService.findOne(id);
  }

  @Post()
  @Permissions('customer.create')
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.create(dto, user.id);
  }

  @Patch(':id')
  @Permissions('customer.edit')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.update(id, dto, user.id);
  }

  @Get(':id/notes')
  @Permissions('customer.view')
  findNotes(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.customersService.findNotes(id);
  }

  @Post(':id/notes')
  @Permissions('customer.view', 'customer.note.create')
  createNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateCustomerNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.customersService.createNote(id, dto, user.id);
  }
}
