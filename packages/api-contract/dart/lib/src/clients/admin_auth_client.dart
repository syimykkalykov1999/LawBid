// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_change_own_credentials_dto.dart';
import '../models/admin_login_start_dto.dart';
import '../models/admin_login_verify_dto.dart';
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
import '../models/admin_two_factor_code_dto.dart';
import '../models/admin_two_factor_enabled_envelope.dart';
import '../models/totp_enrollment_envelope.dart';

part 'admin_auth_client.g.dart';

@RestApi()
abstract class AdminAuthClient {
  factory AdminAuthClient(Dio dio, {String? baseUrl}) = _AdminAuthClient;

  /// Send the sign-in code to an admin email
  @POST('/admin/auth/login/start')
  Future<void> adminLoginStart({
    @Body() required AdminLoginStartDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Check the email code; signs in (or returns the 2FA ticket when the admin turned two-factor on)
  @POST('/admin/auth/login/verify')
  Future<AdminLoginVerifyResultEnvelope> adminLoginVerify({
    @Body() required AdminLoginVerifyDto body,
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

  /// Confirm with the 2FA code (or the own password when two-factor is off) for 5 minutes before a sensitive change
  @POST('/admin/auth/step-up')
  Future<AdminStepUpResultEnvelope> stepUp({
    @Body() required AdminStepUpDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The signed-in admin
  @GET('/admin/auth/me')
  Future<AdminMeEnvelope> adminMe({@Extras() Map<String, dynamic>? extras});

  /// Login + password: signs in (or returns the 2FA ticket when the admin turned two-factor on)
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

  /// Optional two-factor, step 1: a secret for the authenticator app
  @POST('/admin/auth/2fa/begin')
  Future<TotpEnrollmentEnvelope> twoFactorBegin({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Optional two-factor, step 2: confirm with a code; returns recovery codes once
  @POST('/admin/auth/2fa/enable')
  Future<AdminTwoFactorEnabledEnvelope> twoFactorEnable({
    @Body() required AdminTwoFactorCodeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Turn two-factor off (needs a current code)
  @POST('/admin/auth/2fa/disable')
  Future<AdminOkEnvelope> twoFactorDisable({
    @Body() required AdminTwoFactorCodeDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
