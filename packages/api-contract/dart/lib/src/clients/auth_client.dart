// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/assistant_code_login_dto.dart';
import '../models/auth_tokens_envelope.dart';
import '../models/continue_login_dto.dart';
import '../models/identifier_linked_envelope.dart';
import '../models/link_identifier_dto.dart';
import '../models/logged_out_envelope.dart';
import '../models/otp_request_dto.dart';
import '../models/otp_sent_envelope.dart';
import '../models/otp_verify_dto.dart';
import '../models/otp_verify_link_dto.dart';
import '../models/passkey_assert_dto.dart';
import '../models/passkey_authentication_options_envelope.dart';
import '../models/passkey_envelope.dart';
import '../models/passkey_list_envelope.dart';
import '../models/passkey_login_dto.dart';
import '../models/passkey_login_options_dto.dart';
import '../models/passkey_register_dto.dart';
import '../models/passkey_registration_options_envelope.dart';
import '../models/passkey_removed_envelope.dart';
import '../models/password_login_dto.dart';
import '../models/password_reset_confirm_dto.dart';
import '../models/password_reset_request_dto.dart';
import '../models/password_reset_sent_envelope.dart';
import '../models/password_saved_envelope.dart';
import '../models/phone_status_dto.dart';
import '../models/phone_status_result_envelope.dart';
import '../models/qr_login_answered_envelope.dart';
import '../models/qr_login_create_dto.dart';
import '../models/qr_login_created_envelope.dart';
import '../models/qr_login_poll_dto.dart';
import '../models/qr_login_poll_result_envelope.dart';
import '../models/qr_login_preview_envelope.dart';
import '../models/reauth_dto.dart';
import '../models/reauth_token_envelope.dart';
import '../models/refresh_token_dto.dart';
import '../models/session_ended_envelope.dart';
import '../models/session_list_envelope.dart';
import '../models/set_password_dto.dart';
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

  /// Owner 2026-10-04: an assistant signs in with the one-time code the.
  /// attorney got for their seat — no SMS. A new account becomes the.
  /// assistant; a code issued again signs the same assistant in on a new.
  /// phone (the old one is signed out).
  @POST('/auth/assistant/code')
  Future<AuthTokensEnvelope> assistantCodeLogin({
    @Body() required AssistantCodeLoginDto body,
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

  /// Owner 2026-10-08: a DEMO session gets its reauth token without the.
  /// one-time code (the demo world cannot deliver one). Decided on the.
  /// server from the signed demo claim — see DemoReauthService.
  @POST('/auth/reauth/demo')
  Future<ReauthTokenEnvelope> reauthDemo({
    @Extras() Map<String, dynamic>? extras,
  });

  /// [xReauthToken] - Required: single-use token from POST /auth/reauth (a new sign-in method).
  @POST('/auth/identifiers')
  Future<IdentifierLinkedEnvelope> linkIdentifier({
    @Body() required LinkIdentifierDto body,
    @Header('X-Reauth-Token') String? xReauthToken,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/auth/phone/status')
  Future<PhoneStatusResultEnvelope> phoneStatus({
    @Body() required PhoneStatusDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Owner 2026-10-13: sign in with a phone number or e-mail and the.
  /// password — no SMS (the code is only for sign-up and a forgotten.
  /// password).
  @POST('/auth/password/login')
  Future<AuthTokensEnvelope> passwordLogin({
    @Body() required PasswordLoginDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Sets the password of the signed-in account (right after the sign-up.
  /// code); changing an existing one needs `currentPassword`. Owner.
  /// 2026-10-22 (security audit #3): either the current password or a.
  /// reauth token — and with no password yet, a reauth token unless this.
  /// session signed in minutes ago (the sign-up code itself).
  ///
  /// [xReauthToken] - Single-use token from POST /auth/reauth: replaces currentPassword; with no password yet it is required unless this session signed in within the last 10 minutes.
  @POST('/auth/password')
  Future<PasswordSavedEnvelope> setPassword({
    @Body() required SetPasswordDto body,
    @Header('X-Reauth-Token') String? xReauthToken,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Forgot password: a code to the verified e-mail, else an SMS. The.
  /// answer is the same for an unknown account.
  @POST('/auth/password/reset/request')
  Future<PasswordResetSentEnvelope> passwordResetRequest({
    @Body() required PasswordResetRequestDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Forgot password: the code + a new password; ends every session and.
  /// signs this device in.
  @POST('/auth/password/reset/confirm')
  Future<AuthTokensEnvelope> passwordResetConfirm({
    @Body() required PasswordResetConfirmDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/auth/qr')
  Future<QrLoginCreatedEnvelope> qrCreate({
    @Body() required QrLoginCreateDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The website waits: pending → scanned → tokens (once).
  @POST('/auth/qr/poll')
  Future<QrLoginPollResultEnvelope> qrPoll({
    @Body() required QrLoginPollDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The phone scanned the code: which browser is asking?
  @GET('/auth/qr/{qrId}')
  Future<QrLoginPreviewEnvelope> qrPreview({
    @Path('qrId') required String qrId,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/auth/qr/{qrId}/approve')
  Future<QrLoginAnsweredEnvelope> qrApprove({
    @Path('qrId') required String qrId,
    @Extras() Map<String, dynamic>? extras,
  });

  @POST('/auth/qr/{qrId}/reject')
  Future<QrLoginAnsweredEnvelope> qrReject({
    @Path('qrId') required String qrId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Options to create a passkey for this account.
  ///
  /// [xReauthToken] - Single-use reauthToken (5 min). Needed only when the sign-in is not recent.
  @POST('/auth/passkeys/register/options')
  Future<PasskeyRegistrationOptionsEnvelope> passkeyRegisterOptions({
    @Header('X-Reauth-Token') String? xReauthToken,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Store the passkey the authenticator created.
  ///
  /// [xReauthToken] - Single-use reauthToken (5 min). Needed only when the sign-in is not recent.
  @POST('/auth/passkeys/register')
  Future<PasskeyEnvelope> passkeyRegister({
    @Body() required PasskeyRegisterDto body,
    @Header('X-Reauth-Token') String? xReauthToken,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The passkeys of this account
  @GET('/auth/passkeys')
  Future<PasskeyListEnvelope> passkeyList({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a passkey (recent sign-in or reauth token).
  ///
  /// [xReauthToken] - Single-use reauthToken (5 min). Needed only when the sign-in is not recent.
  @DELETE('/auth/passkeys/{id}')
  Future<PasskeyRemovedEnvelope> passkeyRemove({
    @Path('id') required String id,
    @Header('X-Reauth-Token') String? xReauthToken,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Options to sign in with a passkey (no identifier: the authenticator offers the saved accounts)
  @POST('/auth/passkeys/login/options')
  Future<PasskeyAuthenticationOptionsEnvelope> passkeyLoginOptions({
    @Body() required PasskeyLoginOptionsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Sign in with the passkey assertion
  @POST('/auth/passkeys/login')
  Future<AuthTokensEnvelope> passkeyLogin({
    @Body() required PasskeyLoginDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Options to confirm a sensitive action with a passkey
  @POST('/auth/passkeys/reauth/options')
  Future<PasskeyAuthenticationOptionsEnvelope> passkeyReauthOptions({
    @Extras() Map<String, dynamic>? extras,
  });

  /// A single-use X-Reauth-Token from the passkey assertion (instead of an OTP)
  @POST('/auth/passkeys/reauth')
  Future<ReauthTokenEnvelope> passkeyReauth({
    @Body() required PasskeyAssertDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
