// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/auth_tokens_envelope.dart';
import '../models/continue_login_dto.dart';
import '../models/identifier_linked_envelope.dart';
import '../models/link_identifier_dto.dart';
import '../models/logged_out_envelope.dart';
import '../models/otp_request_dto.dart';
import '../models/otp_sent_envelope.dart';
import '../models/otp_verify_dto.dart';
import '../models/otp_verify_link_dto.dart';
import '../models/reauth_dto.dart';
import '../models/reauth_token_envelope.dart';
import '../models/refresh_token_dto.dart';
import '../models/session_ended_envelope.dart';
import '../models/session_list_envelope.dart';
import '../models/social_login_dto.dart';

part 'auth_client.g.dart';

@RestApi()
abstract class AuthClient {
  factory AuthClient(Dio dio, {String? baseUrl}) = _AuthClient;

  @POST('/auth/otp/request')
  Future<OtpSentEnvelope> requestOtp({
    @Body() required OtpRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/auth/otp/verify')
  Future<AuthTokensEnvelope> verifyOtp({
    @Body() required OtpVerifyDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Owner 2026-10-01: the sign-in answered 409 AUTH_OTHER_DEVICE_ACTIVE.
  /// and the user chose to continue — the other phone / browser is signed.
  /// out (one phone + one website per account).
  @POST('/auth/login/continue')
  Future<AuthTokensEnvelope> continueLogin({
    @Body() required ContinueLoginDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Email magic link (docs/01 §10.2 E): one-time token from the email +.
  /// the verifier held by the device that requested the code.
  @POST('/auth/otp/verify-link')
  Future<AuthTokensEnvelope> verifyOtpLink({
    @Body() required OtpVerifyLinkDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/auth/social')
  Future<AuthTokensEnvelope> social({
    @Body() required SocialLoginDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/auth/refresh')
  Future<AuthTokensEnvelope> refresh({
    @Body() required RefreshTokenDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/auth/logout')
  Future<LoggedOutEnvelope> logout({@Extras() Map<String, dynamic>? extras});

  @POST('/auth/logout-all')
  Future<LoggedOutEnvelope> logoutAll({@Extras() Map<String, dynamic>? extras});

  @GET('/auth/sessions')
  Future<SessionListEnvelope> listSessions({
    @Extras() Map<String, dynamic>? extras,
  });

  @DELETE('/auth/sessions/{id}')
  Future<SessionEndedEnvelope> endSession({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/auth/reauth')
  Future<ReauthTokenEnvelope> reauth({
    @Body() required ReauthDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/auth/identifiers')
  Future<IdentifierLinkedEnvelope> linkIdentifier({
    @Body() required LinkIdentifierDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
