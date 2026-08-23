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
  AssignEmployeeShiftDto,
  AssignShiftDto,
  AttendanceQueryDto,
  CreateEmployeeDocumentDto,
  CreateEmployeeDto,
  CreateLeaveRequestDto,
  CreateShiftDto,
  EmployeeQueryDto,
  ReviewLeaveDto,
  UpdateAttendanceDto,
  UpdateEmployeeDto,
  UpdateEmploymentStatusDto,
  UpdateProcessDto,
  UpdateShiftDto,
} from './dto/hr.dto';
import { HrService } from './hr.service';

@Controller('hr')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Post('employees')
  @Permissions('hr.employee.create')
  createEmployee(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.createEmployee(dto, user.id, getRequestMetadata(req));
  }
  @Get('employees')
  @Permissions('hr.employee.view')
  employees(@Query() query: EmployeeQueryDto) {
    return this.hr.findEmployees(query);
  }
  @Get('employees/:id')
  @Permissions('hr.employee.view')
  employee(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hr.findEmployee(id, user);
  }
  @Patch('employees/:id')
  @Permissions('hr.employee.edit')
  updateEmployee(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.updateEmployee(id, dto, user.id, getRequestMetadata(req));
  }
  @Patch('employees/:id/status')
  @Permissions('hr.employee.status.manage')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmploymentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.updateStatus(id, dto, user.id, getRequestMetadata(req));
  }
  @Patch('employees/:id/onboarding')
  @Permissions('hr.employee.edit')
  onboarding(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProcessDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.updateProcess(
      id,
      'onboarding',
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }
  @Patch('employees/:id/offboarding')
  @Permissions('hr.employee.status.manage')
  offboarding(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProcessDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.updateProcess(
      id,
      'offboarding',
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }

  @Post('attendance/check-in') checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.checkIn(user.id, getRequestMetadata(req));
  }
  @Post('attendance/check-out') checkOut(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.checkOut(user.id, getRequestMetadata(req));
  }
  @Get('attendance/my') myAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.hr.myAttendance(user.id);
  }
  @Get('attendance')
  @Permissions('hr.attendance.view')
  attendance(@Query() query: AttendanceQueryDto) {
    return this.hr.findAttendance(query);
  }
  @Patch('attendance/:id')
  @Permissions('hr.attendance.manage')
  correctAttendance(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.updateAttendance(id, dto, user.id, getRequestMetadata(req));
  }

  @Get('shifts') @Permissions('hr.shift.view') shifts() {
    return this.hr.shifts();
  }
  @Post('shifts') @Permissions('hr.shift.manage') createShift(
    @Body() dto: CreateShiftDto,
  ) {
    return this.hr.createShift(dto);
  }
  @Patch('shifts/:id') @Permissions('hr.shift.manage') updateShift(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    return this.hr.updateShift(id, dto);
  }
  @Post('employee-shifts') @Permissions('hr.shift.manage') assignShift(
    @Body() dto: AssignShiftDto,
  ) {
    return this.hr.assignShift(dto);
  }

  @Post('employees/:id/shifts')
  @Permissions('hr.shift.manage')
  assignEmployeeShift(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignEmployeeShiftDto,
  ) {
    return this.hr.assignEmployeeShift(id, dto);
  }

  @Post('leave')
  @Permissions('hr.leave.create')
  createLeave(
    @Body() dto: CreateLeaveRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.createLeave(dto, user.id, getRequestMetadata(req));
  }
  @Get('leave/my') @Permissions('hr.leave.view_own') myLeave(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hr.myLeave(user.id);
  }
  @Get('leave/requests') @Permissions('hr.leave.manage') leaveRequests() {
    return this.hr.leaveRequests();
  }
  @Post('leave/:id/approve') @Permissions('hr.leave.manage') approveLeave(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewLeaveDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.reviewLeave(
      id,
      'APPROVED',
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }
  @Post('leave/:id/reject') @Permissions('hr.leave.manage') rejectLeave(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewLeaveDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.reviewLeave(
      id,
      'REJECTED',
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }
  @Post('leave/:id/cancel') @Permissions('hr.leave.view_own') cancelLeave(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.cancelLeave(id, user.id, getRequestMetadata(req));
  }

  @Get('employees/:id/documents') @Permissions('hr.document.view') documents(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.hr.employeeDocuments(id);
  }
  @Post('employees/:id/documents')
  @Permissions('hr.document.manage')
  addDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateEmployeeDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.createDocument(id, dto, user.id, getRequestMetadata(req));
  }
}
