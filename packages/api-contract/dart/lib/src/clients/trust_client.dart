// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/firm_email_confirm_dto.dart';
import '../models/firm_email_request_dto.dart';
import '../models/firm_email_result_envelope.dart';
import '../models/own_trust_envelope.dart';
import '../models/public_trust_envelope.dart';

part 'trust_client.g.dart';

@RestApi()
abstract class TrustClient {
  factory TrustClient(Dio dio, {String? baseUrl}) = _TrustClient;

  /// Send a code to my address at the firm (firm link)
  @POST('/trust/me/firm-email')
  Future<FirmEmailResultEnvelope> requestFirmEmailCode({
    @Body() required FirmEmailRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Confirm the firm e-mail code
  @POST('/trust/me/firm-email/confirm')
  Future<FirmEmailResultEnvelope> confirmFirmEmailCode({
    @Body() required FirmEmailConfirmDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My trust level, gates and next steps (attorney)
  @GET('/trust/me')
  Future<OwnTrustEnvelope> getMyTrust({@Extras() Map<String, dynamic>? extras});

  /// An attorney's trust level: what LawBid checked (any signed-in user)
  @GET('/trust/attorneys/{attorneyId}')
  Future<PublicTrustEnvelope> getAttorneyTrust({
    @Path('attorneyId') required String attorneyId,
    @Extras() Map<String, dynamic>? extras,
  });
}
