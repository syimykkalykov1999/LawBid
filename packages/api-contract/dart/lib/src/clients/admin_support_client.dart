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
import '../models/priority.dart';
import '../models/status8.dart';

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
  @GET('/admin/support/tickets')
  Future<AdminSupportTicketRowListEnvelope> listAdminSupportTickets({
    @Query('cursor') String? cursor,
    @Query('status') Status8? status,
    @Query('category') Category? category,
    @Query('priority') Priority? priority,
    @Query('assignee') String? assignee,
    @Query('q') String? q,
    @Query('userId') String? userId,
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
}
