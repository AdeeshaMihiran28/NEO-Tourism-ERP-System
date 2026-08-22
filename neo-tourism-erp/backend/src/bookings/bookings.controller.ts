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
import {
  AssignOperationsDto,
  BookingQueryDto,
  CreateBookingDocumentDto,
  CreateBookingNoteDto,
  CreateBookingReferenceDto,
  CreateBookingSupplierDto,
  CreateBookingTaskDto,
  CreatePassengerDto,
  UpdateBookingDto,
  UpdateBookingReferenceDto,
  UpdateBookingStatusDto,
  UpdateBookingSupplierDto,
  UpdateBookingTaskDto,
  UpdateOperationsStatusDto,
  UpdatePassengerDto,
  UpdateTravelStatusDto,
} from './dto/booking.dto';
import { BookingsService } from './bookings.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post('sale-submissions/:id/create-booking')
  @Permissions('booking.create')
  create(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.createFromSale(
      id,
      user,
      getRequestMetadata(request),
    );
  }

  @Get('bookings')
  @Permissions('booking.view')
  findAll(
    @Query() query: BookingQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.findAll(query, user);
  }

  @Get('bookings/:id')
  @Permissions('booking.view')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.findOne(id, user);
  }

  @Patch('bookings/:id')
  @Permissions('booking.edit')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBookingDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.update(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('bookings/:id/assign-operations')
  @Permissions('booking.assign_operations')
  assignOperations(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignOperationsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.assignOperations(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Patch('bookings/:id/status')
  @Permissions('booking.status.manage')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBookingStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.updateStatus(
      id,
      'status',
      dto.status,
      'BOOKING_STATUS_CHANGED',
      user,
      getRequestMetadata(request),
    );
  }

  @Patch('bookings/:id/operations-status')
  @Permissions('booking.status.manage')
  updateOperationsStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOperationsStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.updateStatus(
      id,
      'operationsStatus',
      dto.status,
      'OPERATIONS_STATUS_CHANGED',
      user,
      getRequestMetadata(request),
    );
  }

  @Patch('bookings/:id/travel-status')
  @Permissions('booking.status.manage')
  updateTravelStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTravelStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.updateStatus(
      id,
      'travelStatus',
      dto.status,
      'TRAVEL_STATUS_CHANGED',
      user,
      getRequestMetadata(request),
    );
  }

  @Post('bookings/:id/passengers')
  @Permissions('booking.manage_passengers')
  addPassenger(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreatePassengerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.addPassenger(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Patch('bookings/:id/passengers/:passengerId')
  @Permissions('booking.manage_passengers')
  updatePassenger(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('passengerId', new ParseUUIDPipe()) passengerId: string,
    @Body() dto: UpdatePassengerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.updatePassenger(
      id,
      passengerId,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('bookings/:id/suppliers')
  @Permissions('booking.manage_suppliers')
  addSupplier(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateBookingSupplierDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.addSupplier(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Patch('bookings/:id/suppliers/:bookingSupplierId')
  @Permissions('booking.manage_suppliers')
  updateSupplier(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('bookingSupplierId', new ParseUUIDPipe()) relationId: string,
    @Body() dto: UpdateBookingSupplierDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.updateSupplier(
      id,
      relationId,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('bookings/:id/references')
  @Permissions('booking.manage_references')
  addReference(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateBookingReferenceDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.addReference(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Patch('bookings/:id/references/:referenceId')
  @Permissions('booking.manage_references')
  updateReference(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('referenceId', new ParseUUIDPipe()) referenceId: string,
    @Body() dto: UpdateBookingReferenceDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.updateReference(
      id,
      referenceId,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('bookings/:id/documents')
  @Permissions('booking.manage_documents')
  addDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateBookingDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.addDocument(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('bookings/:id/notes')
  @Permissions('booking.manage_notes')
  addNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateBookingNoteDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.addNote(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Post('bookings/:id/tasks')
  @Permissions('booking.manage_tasks')
  addTask(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateBookingTaskDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.addTask(
      id,
      dto,
      user,
      getRequestMetadata(request),
    );
  }

  @Patch('bookings/:id/tasks/:taskId')
  @Permissions('booking.manage_tasks')
  updateTask(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() dto: UpdateBookingTaskDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.bookingsService.updateTask(
      id,
      taskId,
      dto,
      user,
      getRequestMetadata(request),
    );
  }
}
