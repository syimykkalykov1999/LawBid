// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_support_ticket_dto.dart';
import '../models/support_message_body_dto.dart';
import '../models/support_message_envelope.dart';
import '../models/support_ticket_detail_envelope.dart';
import '../models/support_ticket_envelope.dart';
import '../models/support_ticket_list_envelope.dart';

part 'support_client.g.dart';

@RestApi()
abstract class SupportClient {
  factory SupportClient(Dio dio, {String? baseUrl}) = _SupportClient;

  /// Open a support ticket with the first message
  @POST('/support/tickets')
  Future<SupportTicketDetailEnvelope> createSupportTicket({
    @Body() required CreateSupportTicketDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My tickets, latest activity first.
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/support/tickets')
  Future<SupportTicketListEnvelope> listMySupportTickets({
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One of my tickets with its messages (marks read)
  @GET('/support/tickets/{id}')
  Future<SupportTicketDetailEnvelope> getMySupportTicket({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Write to support (reopens a resolved ticket; closed → 409)
  @POST('/support/tickets/{id}/messages')
  Future<SupportMessageEnvelope> replyToSupportTicket({
    @Path('id') required String id,
    @Body() required SupportMessageBodyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Close my ticket (no more replies)
  @POST('/support/tickets/{id}/close')
  Future<SupportTicketEnvelope> closeMySupportTicket({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
