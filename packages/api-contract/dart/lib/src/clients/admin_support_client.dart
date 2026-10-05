// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_support_message_envelope.dart';
import '../models/admin_support_reply_dto.dart';
import '../models/admin_support_stats_envelope.dart';
import '../models/admin_support_ticket_detail_envelope.dart';
import '../models/admin_support_ticket_row_envelope.dart';
import '../models/admin_support_ticket_row_list_envelope.dart';
import '../models/admin_update_support_ticket_dto.dart';
import '../models/category.dart';
import '../models/create_support_macro_dto.dart';
import '../models/priority.dart';
import '../models/sla.dart';
import '../models/status9.dart';
import '../models/support_agent_envelope.dart';
import '../models/support_agent_list_envelope.dart';
import '../models/support_desk_settings_envelope.dart';
import '../models/support_macro_envelope.dart';
import '../models/support_macro_list_envelope.dart';
import '../models/support_next_ticket_envelope.dart';
import '../models/support_staff_stats_list_envelope.dart';
import '../models/update_support_agent_dto.dart';
import '../models/update_support_desk_settings_dto.dart';
import '../models/update_support_macro_dto.dart';

part 'admin_support_client.g.dart';

@RestApi()
abstract class AdminSupportClient {
  factory AdminSupportClient(Dio dio, {String? baseUrl}) = _AdminSupportClient;

  /// Support tickets, latest activity first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [assignee] - `me`, `unassigned` or an admin user id.
  ///
  /// [q] - Substring of the subject.
  ///
  /// [sla] - Owner 2026-10-05: `breached` = the answer is late (SLA missed); `waiting` = an answer is due (oldest deadline first).
  @GET('/admin/support/tickets')
  Future<AdminSupportTicketRowListEnvelope> listAdminSupportTickets({
    @Query('cursor') String? cursor,
    @Query('status') Status9? status,
    @Query('category') Category? category,
    @Query('priority') Priority? priority,
    @Query('assignee') String? assignee,
    @Query('q') String? q,
    @Query('userId') String? userId,
    @Query('sla') Sla? sla,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Counts per status, unassigned / unread (dashboard badge)
  @GET('/admin/support/stats')
  Future<AdminSupportStatsEnvelope> getAdminSupportStats({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Ticket, all messages incl. internal notes, user summary (marks read)
  @GET('/admin/support/tickets/{id}')
  Future<AdminSupportTicketDetailEnvelope> getAdminSupportTicket({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change status, priority or assignee
  @PATCH('/admin/support/tickets/{id}')
  Future<AdminSupportTicketRowEnvelope> updateAdminSupportTicket({
    @Path('id') required String id,
    @Body() required AdminUpdateSupportTicketDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Reply to the user (notifies; status → waiting_user by default) or add an internal note
  @POST('/admin/support/tickets/{id}/messages')
  Future<AdminSupportMessageEnvelope> replyAdminSupportTicket({
    @Path('id') required String id,
    @Body() required AdminSupportReplyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Workspace «Следующий»: my most urgent open ticket, else the most overdue unassigned one (taken by me)
  @POST('/admin/support/tickets/next')
  Future<SupportNextTicketEnvelope> nextAdminSupportTicket({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hours, SLA, auto-assignment, auto-reply
  @GET('/admin/support/settings')
  Future<SupportDeskSettingsEnvelope> getSupportDeskSettings({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change hours, SLA, auto-assignment, auto-reply
  @PUT('/admin/support/settings')
  Future<SupportDeskSettingsEnvelope> updateSupportDeskSettings({
    @Body() required UpdateSupportDeskSettingsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Ready answers (most used first).
  ///
  /// [all] - Include switched-off answers (management).
  @GET('/admin/support/macros')
  Future<SupportMacroListEnvelope> listSupportMacros({
    @Query('all') bool? all,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add a ready answer
  @POST('/admin/support/macros')
  Future<SupportMacroEnvelope> createSupportMacro({
    @Body() required CreateSupportMacroDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit or switch off a ready answer
  @PATCH('/admin/support/macros/{id}')
  Future<SupportMacroEnvelope> updateSupportMacro({
    @Path('id') required String id,
    @Body() required UpdateSupportMacroDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete a ready answer
  @DELETE('/admin/support/macros/{id}')
  Future<void> deleteSupportMacro({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Support team: shifts and open tickets
  @GET('/admin/support/agents')
  Future<SupportAgentListEnvelope> listSupportAgents({
    @Extras() Map<String, dynamic>? extras,
  });

  /// My shift: on / off, how many open tickets I take
  @PUT('/admin/support/agents/me')
  Future<SupportAgentEnvelope> updateMySupportShift({
    @Body() required UpdateSupportAgentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Set someone's shift (team lead)
  @PUT('/admin/support/agents/{adminId}')
  Future<SupportAgentEnvelope> updateSupportAgent({
    @Path('adminId') required String adminId,
    @Body() required UpdateSupportAgentDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Per employee: answers, first-answer time, resolved, late answers (default: last 30 days)
  @GET('/admin/support/staff-stats')
  Future<SupportStaffStatsListEnvelope> getSupportStaffStats({
    @Query('from') DateTime? from,
    @Query('to') DateTime? to,
    @Extras() Map<String, dynamic>? extras,
  });
}
