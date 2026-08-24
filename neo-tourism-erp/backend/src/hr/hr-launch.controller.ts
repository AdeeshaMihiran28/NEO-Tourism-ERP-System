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
import { LeaveApprovalLevel } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { getRequestMetadata } from '../common/request-metadata';
import {
  AcknowledgeDocumentDto,
  AccrueLeaveDto,
  ApprovalCommentDto,
  AssignLeavePolicyDto,
  AttendanceReportQueryDto,
  CreateCustomFieldDto,
  CreateDocumentVersionDto,
  CreateLeavePolicyDto,
  CreateTaskTemplateDto,
  DirectoryQueryDto,
  ExpiringDocumentsQueryDto,
  HrReportQueryDto,
  LeaveBalanceQueryDto,
  LeaveCalendarQueryDto,
  ReviewAccessDto,
  SetCustomFieldValueDto,
  StartProcessDto,
  UpdateCustomFieldDto,
  UpdateDocumentAccessDto,
  UpdateHrTaskDto,
  UpdateMyProfileDto,
  UpsertLeaveApprovalPolicyDto,
  UpsertExitInterviewDto,
  UpsertRoleMappingDto,
} from './dto/hr-launch.dto';
import { HrLaunchService } from './hr-launch.service';

@Controller('hr')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class HrLaunchController {
  constructor(private readonly hr: HrLaunchService) {}

  @Get('employees/:id/employment-history')
  @Permissions('hr.employment_history.view')
  history(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.hr.employmentHistory(id);
  }

  @Get('org-chart')
  @Permissions('hr.org_chart.view')
  orgChart() {
    return this.hr.orgChart();
  }

  @Get('directory')
  @Permissions('hr.directory.view')
  directory(@Query() query: DirectoryQueryDto) {
    return this.hr.directory(query);
  }

  @Get('custom-fields')
  @Permissions('hr.custom_field.manage')
  customFields() {
    return this.hr.customFields();
  }

  @Post('custom-fields')
  @Permissions('hr.custom_field.manage')
  createCustomField(
    @Body() dto: CreateCustomFieldDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.createCustomField(dto, user.id, getRequestMetadata(req));
  }

  @Patch('custom-fields/:id')
  @Permissions('hr.custom_field.manage')
  updateCustomField(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomFieldDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.updateCustomField(id, dto, user.id, getRequestMetadata(req));
  }

  @Patch('employees/:employeeId/custom-fields/:definitionId')
  @Permissions('hr.custom_field.manage')
  setCustomFieldValue(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('definitionId', new ParseUUIDPipe()) definitionId: string,
    @Body() dto: SetCustomFieldValueDto,
  ) {
    return this.hr.setCustomFieldValue(employeeId, definitionId, dto);
  }

  @Get('leave/policies')
  @Permissions('hr.leave.balance.manage')
  leavePolicies() {
    return this.hr.leavePolicies();
  }

  @Post('leave/policies')
  @Permissions('hr.leave.balance.manage')
  createLeavePolicy(
    @Body() dto: CreateLeavePolicyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.createLeavePolicy(dto, user.id, getRequestMetadata(req));
  }

  @Get('leave/approval-policies')
  @Permissions('hr.leave.balance.manage')
  leaveApprovalPolicies() {
    return this.hr.leaveApprovalPolicies();
  }

  @Post('leave/approval-policies')
  @Permissions('hr.leave.balance.manage')
  upsertLeaveApprovalPolicy(@Body() dto: UpsertLeaveApprovalPolicyDto) {
    return this.hr.upsertLeaveApprovalPolicy(dto);
  }

  @Post('leave/balances/accrue')
  @Permissions('hr.leave.balance.manage')
  accrueLeave(
    @Body() dto: AccrueLeaveDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.accrueLeave(dto, user.id, getRequestMetadata(req));
  }

  @Get('leave/manager-requests')
  @Permissions('hr.leave.manager_approve')
  managerLeaveRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.hr.managerLeaveRequests(user.id);
  }

  @Post('leave/policies/assign')
  @Permissions('hr.leave.balance.manage')
  assignLeavePolicy(@Body() dto: AssignLeavePolicyDto) {
    return this.hr.assignLeavePolicy(dto);
  }

  @Get('leave/balances/my')
  @Permissions('hr.leave.view_own')
  myBalances(@CurrentUser() user: AuthenticatedUser) {
    return this.hr.myBalances(user.id);
  }

  @Get('leave/balances')
  @Permissions('hr.leave.balance.view')
  balances(@Query() query: LeaveBalanceQueryDto) {
    return this.hr.balances(query);
  }

  @Post('leave/:id/manager-approve')
  @Permissions('hr.leave.manager_approve')
  managerApprove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApprovalCommentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.approveLeaveLevel(
      id,
      LeaveApprovalLevel.MANAGER,
      dto,
      user,
      getRequestMetadata(req),
    );
  }

  @Post('leave/:id/hr-approve')
  @Permissions('hr.leave.hr_approve')
  hrApprove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApprovalCommentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.approveLeaveLevel(
      id,
      LeaveApprovalLevel.HR,
      dto,
      user,
      getRequestMetadata(req),
    );
  }

  @Get('leave/calendar')
  @Permissions('hr.leave.calendar.view')
  leaveCalendar(
    @Query() query: LeaveCalendarQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hr.leaveCalendar(query, user);
  }

  @Get('reports/attendance')
  @Permissions('hr.attendance.report.view')
  attendanceReport(@Query() query: AttendanceReportQueryDto) {
    return this.hr.attendanceReport(query);
  }

  @Get('reports')
  @Permissions('hr.report.view')
  reports(@Query() query: HrReportQueryDto) {
    return this.hr.hrReports(query);
  }

  @Post('onboarding/templates')
  @Permissions('hr.onboarding.manage')
  createOnboardingTemplate(@Body() dto: CreateTaskTemplateDto) {
    return this.hr.createOnboardingTemplate(dto);
  }

  @Post('offboarding/templates')
  @Permissions('hr.offboarding.manage')
  createOffboardingTemplate(@Body() dto: CreateTaskTemplateDto) {
    return this.hr.createOffboardingTemplate(dto);
  }

  @Post('employees/:id/onboarding/start')
  @Permissions('hr.onboarding.manage')
  startOnboarding(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StartProcessDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.startOnboarding(id, dto, user.id, getRequestMetadata(req));
  }

  @Post('employees/:id/offboarding/start')
  @Permissions('hr.offboarding.manage')
  startOffboarding(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StartProcessDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.startOffboarding(id, dto, user.id, getRequestMetadata(req));
  }

  @Get('employees/:id/onboarding/tasks')
  @Permissions('hr.onboarding.view')
  onboardingTasks(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.hr.processTasks(id, 'onboarding');
  }

  @Get('employees/:id/offboarding/tasks')
  @Permissions('hr.offboarding.view')
  offboardingTasks(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.hr.processTasks(id, 'offboarding');
  }

  @Get('employees/:id/offboarding')
  @Permissions('hr.offboarding.view')
  offboardingDetails(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.hr.offboardingDetails(id);
  }

  @Post('employees/:id/offboarding/exit-interview')
  @Permissions('hr.offboarding.manage')
  upsertExitInterview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpsertExitInterviewDto,
  ) {
    return this.hr.upsertExitInterview(id, dto);
  }

  @Patch('onboarding/tasks/:id')
  @Permissions('hr.onboarding.manage')
  updateOnboardingTask(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateHrTaskDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.updateTask(
      'onboarding',
      id,
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }

  @Patch('offboarding/tasks/:id')
  @Permissions('hr.offboarding.manage')
  updateOffboardingTask(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateHrTaskDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.updateTask(
      'offboarding',
      id,
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }

  @Post('employees/:id/offboarding/complete')
  @Permissions('hr.offboarding.manage')
  completeOffboarding(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApprovalCommentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.completeOffboarding(
      id,
      user.id,
      dto.comment,
      getRequestMetadata(req),
    );
  }

  @Get('me')
  myProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.hr.myProfile(user.id);
  }

  @Patch('me')
  updateMyProfile(
    @Body() dto: UpdateMyProfileDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.updateMyProfile(user.id, dto, getRequestMetadata(req));
  }

  @Get('team')
  @Permissions('hr.team.view')
  myTeam(@CurrentUser() user: AuthenticatedUser) {
    return this.hr.myTeam(user.id);
  }

  @Get('documents/my')
  @Permissions('hr.document.view_own')
  ownDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.hr.ownDocuments(user.id);
  }

  @Patch('documents/:id/access')
  @Permissions('hr.document.manage')
  updateDocumentAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDocumentAccessDto,
  ) {
    return this.hr.updateDocumentAccess(id, dto);
  }

  @Post('documents/:id/versions')
  @Permissions('hr.document.manage')
  addDocumentVersion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateDocumentVersionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.addDocumentVersion(
      id,
      dto,
      user.id,
      getRequestMetadata(req),
    );
  }

  @Post('documents/:id/acknowledge')
  @Permissions('hr.document.view_own')
  acknowledgeDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AcknowledgeDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.acknowledgeDocument(
      id,
      dto,
      user.id,
      req.ip,
      getRequestMetadata(req),
    );
  }

  @Get('documents/expiring')
  @Permissions('hr.document.view_all')
  expiringDocuments(@Query() query: ExpiringDocumentsQueryDto) {
    return this.hr.expiringDocuments(query);
  }

  @Get('access-reviews')
  @Permissions('hr.access_review.view')
  accessReviews() {
    return this.hr.accessReviews();
  }

  @Patch('access-reviews/:id')
  @Permissions('hr.access_review.manage')
  reviewAccess(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewAccessDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.hr.reviewAccess(id, dto, user.id, getRequestMetadata(req));
  }

  @Get('role-mappings')
  @Permissions('hr.access_review.view')
  roleMappings() {
    return this.hr.roleMappings();
  }

  @Post('role-mappings')
  @Permissions('hr.access_review.manage')
  upsertRoleMapping(@Body() dto: UpsertRoleMappingDto) {
    return this.hr.upsertRoleMapping(dto);
  }
}
