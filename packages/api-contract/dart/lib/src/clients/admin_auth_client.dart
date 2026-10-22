// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_change_own_credentials_dto.dart';
import '../models/admin_invite_accept_dto.dart';
import '../models/admin_invite_accept_result_envelope.dart';
import '../models/admin_invite_preview_envelope.dart';
import '../models/admin_login_verify_result_envelope.dart';
import '../models/admin_logout_result_envelope.dart';
import '../models/admin_me_envelope.dart';
import '../models/admin_ok_envelope.dart';
import '../models/admin_password_login_dto.dart';
import '../models/admin_recover_password_dto.dart';
import '../models/admin_recover_question_dto.dart';
import '../models/admin_recover_question_result_envelope.dart';
import '../models/admin_recovery_dto.dart';
import '../models/admin_security_question_dto.dart';
import '../models/admin_session_envelope.dart';
import '../models/admin_step_up_dto.dart';
import '../models/admin_step_up_result_envelope.dart';
import '../models/admin_totp_dto.dart';
import '../models/admin_totp_setup_begin_dto.dart';
import '../models/admin_totp_setup_finish_dto.dart';
import '../models/admin_totp_setup_result_envelope.dart';
import '../models/totp_enrollment_envelope.dart';

part 'admin_auth_client.g.dart';

@RestApi()
abstract class AdminAuthClient {
  factory AdminAuthClient(Dio dio, {String? baseUrl}) = _AdminAuthClient;

  /// Forced first setup, step A: a secret / QR for the authenticator app (password ticket)
  @POST('/admin/auth/login/totp-setup')
  Future<TotpEnrollmentEnvelope> adminTotpSetupBegin({
    @Body() required AdminTotpSetupBeginDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Forced first setup, step B: the first code switches the authenticator on → recovery codes (once) + session
  @POST('/admin/auth/login/totp-confirm')
  Future<AdminTotpSetupResultEnvelope> adminTotpSetupFinish({
    @Body() required AdminTotpSetupFinishDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Authenticator code → admin session (8 h)
  @POST('/admin/auth/totp')
  Future<AdminSessionEnvelope> adminTotp({
    @Body() required AdminTotpDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Recovery code instead of the authenticator
  @POST('/admin/auth/recovery')
  Future<AdminSessionEnvelope> adminRecovery({
    @Body() required AdminRecoveryDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// End this admin session
  @POST('/admin/auth/logout')
  Future<AdminLogoutResultEnvelope> adminLogout({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Confirm with a fresh authenticator code for 5 minutes before a sensitive change (every try is audited)
  @POST('/admin/auth/step-up')
  Future<AdminStepUpResultEnvelope> stepUp({
    @Body() required AdminStepUpDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The signed-in admin
  @GET('/admin/auth/me')
  Future<AdminMeEnvelope> adminMe({@Extras() Map<String, dynamic>? extras});

  /// Who an invite link is for (404 when it is unknown, used or older than 72 hours)
  @GET('/admin/auth/invite/{token}')
  Future<AdminInvitePreviewEnvelope> adminInvitePreview({
    @Path('token') required String token,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The invited admin chooses a login and password; the link is spent. The first sign-in then sets up the authenticator (mandatory).
  @POST('/admin/auth/invite/accept')
  Future<AdminInviteAcceptResultEnvelope> adminInviteAccept({
    @Body() required AdminInviteAcceptDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Login + password → a ticket for step 2: the authenticator code, or (totpSetupRequired) its forced first setup. Never a session on its own.
  @POST('/admin/auth/login/password')
  Future<AdminLoginVerifyResultEnvelope> adminLoginPassword({
    @Body() required AdminPasswordLoginDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Show the super admin security question
  @POST('/admin/auth/recover/question')
  Future<AdminRecoverQuestionResultEnvelope> adminRecoverQuestion({
    @Body() required AdminRecoverQuestionDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Super admin forgot the password: answer the question, set a new one (sessions end)
  @POST('/admin/auth/recover/password')
  Future<AdminOkEnvelope> adminRecoverPassword({
    @Body() required AdminRecoverPasswordDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change my own login and/or password
  @PUT('/admin/auth/me/credentials')
  Future<AdminOkEnvelope> adminChangeOwnCredentials({
    @Body() required AdminChangeOwnCredentialsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Super admin: set the recovery question and answer
  @PUT('/admin/auth/me/security-question')
  Future<AdminOkEnvelope> adminSetSecurityQuestion({
    @Body() required AdminSecurityQuestionDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
