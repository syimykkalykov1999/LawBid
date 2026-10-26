// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/create_firm_dto.dart';
import '../models/firm_envelope.dart';
import '../models/firm_member_list_envelope.dart';
import '../models/invite_firm_member_dto.dart';

part 'firms_client.g.dart';

@RestApi()
abstract class FirmsClient {
  factory FirmsClient(Dio dio, {String? baseUrl}) = _FirmsClient;

  /// Create a firm; the creator is its owner
  @POST('/firms')
  Future<FirmEnvelope> createFirm({
    @Body() required CreateFirmDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My firm (or a pending invitation); 404 if none
  @GET('/firms/me')
  Future<FirmEnvelope> myFirm({@Extras() Map<String, dynamic>? extras});

  /// Owner invites a lawyer to the firm
  @POST('/firms/me/members')
  Future<FirmEnvelope> inviteFirmMember({
    @Body() required InviteFirmMemberDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Accept the invitation to a firm
  @POST('/firms/me/accept')
  Future<FirmEnvelope> acceptFirmInvite({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Leave, decline, or (owner) remove a member
  @DELETE('/firms/me/members/{attorneyId}')
  Future<void> removeFirmMember({
    @Path('attorneyId') required String attorneyId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Members whose licence fits the case
  @GET('/firms/me/cases/{caseId}/eligible')
  Future<FirmMemberListEnvelope> firmMembersForCase({
    @Path('caseId') required String caseId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// A firm page: active members and their states
  @GET('/firms/{id}')
  Future<FirmEnvelope> getFirm({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });
}
