// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/case_invite_envelope.dart';
import '../models/case_invite_list_envelope.dart';
import '../models/create_invite_dto.dart';
import '../models/decline_invite_dto.dart';
import '../models/invite_list_status.dart';

part 'invites_client.g.dart';

@RestApi()
abstract class InvitesClient {
  factory InvitesClient(Dio dio, {String? baseUrl}) = _InvitesClient;

  /// Offer my open case to an attorney (client)
  @POST('/cases/{id}/invites')
  Future<CaseInviteEnvelope> createInvite({
    @Path('id') required String id,
    @Body() required CreateInviteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Invites on a case: all of them for its client, the attorney's own for an attorney
  @GET('/cases/{id}/invites')
  Future<CaseInviteListEnvelope> listCaseInvites({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My invites from clients (attorney).
  ///
  /// [status] - pending (default): waiting for an answer; all: history too.
  @GET('/invites')
  Future<CaseInviteListEnvelope> listMyInvites({
    @Query('status') InviteListStatus? status,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One invite (its client or attorney)
  @GET('/invites/{id}')
  Future<CaseInviteEnvelope> getInvite({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Decline an invite, optionally with a reason
  @POST('/invites/{id}/decline')
  Future<CaseInviteEnvelope> declineInvite({
    @Path('id') required String id,
    @Body() required DeclineInviteDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Cancel my pending invite (client)
  @POST('/invites/{id}/cancel')
  Future<CaseInviteEnvelope> cancelInvite({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
