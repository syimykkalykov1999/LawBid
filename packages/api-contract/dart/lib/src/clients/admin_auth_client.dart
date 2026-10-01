// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/admin_login_start_dto.dart';
import '../models/admin_login_verify_dto.dart';
import '../models/admin_login_verify_result_envelope.dart';
import '../models/admin_logout_result_envelope.dart';
import '../models/admin_me_envelope.dart';
import '../models/admin_recovery_dto.dart';
import '../models/admin_session_envelope.dart';
import '../models/admin_step_up_dto.dart';
import '../models/admin_step_up_result_envelope.dart';
import '../models/admin_totp_dto.dart';

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

  /// Check the email code; returns the 2FA ticket (and enrollment on first sign-in)
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

  /// Confirm with a 2FA code (5 min) before changing API keys
  @POST('/admin/auth/step-up')
  Future<AdminStepUpResultEnvelope> stepUp({
    @Body() required AdminStepUpDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The signed-in admin
  @GET('/admin/auth/me')
  Future<AdminMeEnvelope> adminMe({@Extras() Map<String, dynamic>? extras});
}
