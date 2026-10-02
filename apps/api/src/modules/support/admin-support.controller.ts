import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import {
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
  constructor(private readonly support: AdminSupportService) {}

  @Get('tickets')
  @ApiOperation({ summary: 'Support tickets, latest activity first' })
  @ApiEnvelopeResponse(AdminSupportTicketRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminSupportTickets(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: AdminSupportTicketsQueryDto,
  ): Promise<Page<AdminSupportTicketRowDto>> {
    return this.support.list(admin.id, q);
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
    @Param() p: SupportTicketIdParamDto,
  ): Promise<AdminSupportTicketDetailDto> {
    return this.support.get(p.id);
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
    @Param() p: SupportTicketIdParamDto,
    @Body() dto: AdminUpdateSupportTicketDto,
  ): Promise<AdminSupportTicketRowDto> {
    return this.support.update(p.id, dto);
  }
}
