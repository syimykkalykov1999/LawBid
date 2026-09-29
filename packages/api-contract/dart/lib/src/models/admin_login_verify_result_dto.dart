// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'totp_enrollment_dto.dart';

part 'admin_login_verify_result_dto.g.dart';

@JsonSerializable()
class AdminLoginVerifyResultDto {
  const AdminLoginVerifyResultDto({required this.ticket, this.totpEnrollment});

  factory AdminLoginVerifyResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminLoginVerifyResultDtoFromJson(json);

  /// Short-lived proof that the email code was accepted; exchange it with the TOTP code (or a recovery code).
  final String ticket;

  /// Present on the first sign-in (or after a 2FA reset): bind the authenticator app, then send its code to /totp.
  final TotpEnrollmentDto? totpEnrollment;

  Map<String, Object?> toJson() => _$AdminLoginVerifyResultDtoToJson(this);
}
