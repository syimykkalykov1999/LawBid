import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminSupportService } from './admin-support.service';
import { SupportDeskService } from './support-desk.service';
import { SupportTeamService } from './support-team.service';
import {
  CreateSupportMacroDto,
  SupportAgentDto,
  SupportAgentIdParamDto,
  SupportDeskSettingsDto,
  SupportMacroDto,
  SupportMacroIdParamDto,
  SupportMacrosQueryDto,
  SupportNextTicketDto,
  SupportStaffStatsDto,
  SupportStaffStatsQueryDto,
  UpdateSupportAgentDto,
  UpdateSupportDeskSettingsDto,
  UpdateSupportMacroDto,
  AdminSupportMessageDto,
  AdminSupportReplyDto,
  AdminSupportStatsDto,
  AdminSupportTicketDetailDto,
  AdminSupportTicketRowDto,
  AdminSupportTicketsQueryDto,
  AdminUpdateSupportTicketDto,
  SupportTicketIdParamDto,
} from './support.dto';

const E = ErrorCode;
type Page<T> = { items: T[]; nextCursor: string | null };

/** Owner 2026-10-02: support queue — super_admin + support write,
 * moderators read. */
@ApiTags('admin-support')
@AdminEndpoint('super_admin', 'support', 'moderator')
@Controller('admin/support')
export class AdminSupportController {
  constructor(
    private readonly support: AdminSupportService,
    private readonly desk: SupportDeskService,
    private readonly team: SupportTeamService,
  ) {}

  @Get('tickets')
  @ApiOperation({ summary: 'Support tickets, latest activity first' })
  @ApiEnvelopeResponse(AdminSupportTicketRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminSupportTickets(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: AdminSupportTicketsQueryDto,
  ): Promise<Page<AdminSupportTicketRowDto>> {
    return this.support.list(admin.id, q, admin.countries);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Counts per status, unassigned / unread (dashboard badge)',
  })
  @ApiEnvelopeResponse(AdminSupportStatsDto)
  getAdminSupportStats(): Promise<AdminSupportStatsDto> {
    return this.support.stats();
  }

  @Get('tickets/:id')
  @ApiOperation({
    summary:
      'Ticket, all messages incl. internal notes, user summary (marks read)',
  })
  @ApiEnvelopeResponse(AdminSupportTicketDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getAdminSupportTicket(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: SupportTicketIdParamDto,
  ): Promise<AdminSupportTicketDetailDto> {
    return this.support.get(p.id, admin.countries);
  }

  @Roles('super_admin', 'support')
  @Post('tickets/:id/messages')
  @ApiOperation({
    summary:
      'Reply to the user (notifies; status → waiting_user by default) or add an internal note',
  })
  @ApiEnvelopeResponse(AdminSupportMessageDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  replyAdminSupportTicket(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: SupportTicketIdParamDto,
    @Body() dto: AdminSupportReplyDto,
  ): Promise<AdminSupportMessageDto> {
    return this.support.reply(admin.id, p.id, dto);
  }

  @Roles('super_admin', 'support')
  @Patch('tickets/:id')
  @ApiOperation({ summary: 'Change status, priority or assignee' })
  @ApiEnvelopeResponse(AdminSupportTicketRowDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  updateAdminSupportTicket(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: SupportTicketIdParamDto,
    @Body() dto: AdminUpdateSupportTicketDto,
  ): Promise<AdminSupportTicketRowDto> {
    return this.support.update(p.id, dto, admin.id);
  }

  // --- support 24/7 (owner 2026-10-05) -------------------------------------

  @Roles('super_admin', 'support')
  @Post('tickets/next')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Workspace «Следующий»: my most urgent open ticket, else the most overdue unassigned one (taken by me)',
  })
  @ApiEnvelopeResponse(SupportNextTicketDto)
  async nextAdminSupportTicket(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<SupportNextTicketDto> {
    return { ticket: await this.team.next(admin.id) };
  }

  @Get('settings')
  @ApiOperation({ summary: 'Hours, SLA, auto-assignment, auto-reply' })
  @ApiEnvelopeResponse(SupportDeskSettingsDto)
  getSupportDeskSettings(): Promise<SupportDeskSettingsDto> {
    return this.desk.getSettings();
  }

  @Roles('super_admin', 'support')
  @Put('settings')
  @ApiOperation({ summary: 'Change hours, SLA, auto-assignment, auto-reply' })
  @ApiEnvelopeResponse(SupportDeskSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updateSupportDeskSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateSupportDeskSettingsDto,
  ): Promise<SupportDeskSettingsDto> {
    return this.desk.updateSettings(admin.id, dto);
  }

  @Get('macros')
  @ApiOperation({ summary: 'Ready answers (most used first)' })
  @ApiEnvelopeResponse(SupportMacroDto, { isArray: true })
  listSupportMacros(
    @Query() q: SupportMacrosQueryDto,
  ): Promise<SupportMacroDto[]> {
    return this.team.macros(!q.all);
  }

  @Roles('super_admin', 'support')
  @Post('macros')
  @ApiOperation({ summary: 'Add a ready answer' })
  @ApiEnvelopeResponse(SupportMacroDto, { status: HttpStatus.CREATED })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  createSupportMacro(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateSupportMacroDto,
  ): Promise<SupportMacroDto> {
    return this.team.createMacro(admin.id, dto);
  }

  @Roles('super_admin', 'support')
  @Patch('macros/:id')
  @ApiOperation({ summary: 'Edit or switch off a ready answer' })
  @ApiEnvelopeResponse(SupportMacroDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  updateSupportMacro(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: SupportMacroIdParamDto,
    @Body() dto: UpdateSupportMacroDto,
  ): Promise<SupportMacroDto> {
    return this.team.updateMacro(admin.id, p.id, dto);
  }

  @Roles('super_admin', 'support')
  @Delete('macros/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a ready answer' })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async deleteSupportMacro(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: SupportMacroIdParamDto,
  ): Promise<void> {
    await this.team.deleteMacro(admin.id, p.id);
  }

  @Get('agents')
  @ApiOperation({ summary: 'Support team: shifts and open tickets' })
  @ApiEnvelopeResponse(SupportAgentDto, { isArray: true })
  listSupportAgents(): Promise<SupportAgentDto[]> {
    return this.team.agents();
  }

  @Roles('super_admin', 'support')
  @Put('agents/me')
  @ApiOperation({ summary: 'My shift: on / off, how many open tickets I take' })
  @ApiEnvelopeResponse(SupportAgentDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  updateMySupportShift(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: UpdateSupportAgentDto,
  ): Promise<SupportAgentDto> {
    return this.team.setAgent(admin.id, admin.id, dto);
  }

  @Roles('super_admin', 'support')
  @Put('agents/:adminId')
  @ApiOperation({ summary: "Set someone's shift (team lead)" })
  @ApiEnvelopeResponse(SupportAgentDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  updateSupportAgent(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: SupportAgentIdParamDto,
    @Body() dto: UpdateSupportAgentDto,
  ): Promise<SupportAgentDto> {
    return this.team.setAgent(admin.id, p.adminId, dto);
  }

  @Get('staff-stats')
  @ApiOperation({
    summary:
      'Per employee: answers, first-answer time, resolved, late answers (default: last 30 days)',
  })
  @ApiEnvelopeResponse(SupportStaffStatsDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  getSupportStaffStats(
    @Query() q: SupportStaffStatsQueryDto,
  ): Promise<SupportStaffStatsDto[]> {
    return this.team.staffStats(q);
  }
}
