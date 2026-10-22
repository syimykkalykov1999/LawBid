// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_session_dto.dart';

part 'admin_login_verify_result_dto.g.dart';

@JsonSerializable()
class AdminLoginVerifyResultDto {
  const AdminLoginVerifyResultDto({
    required this.ticket,
    required this.session,
    required this.totpSetupRequired,
  });

  factory AdminLoginVerifyResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminLoginVerifyResultDtoFromJson(json);

  /// The ticket for step 2: the authenticator code (or a recovery code) at /totp — or, when totpSetupRequired, the forced setup at /login/totp-setup.
  final String? ticket;

  /// Always null since owner 2026-10-22: the password alone never signs in.
  final AdminSessionDto? session;

  /// This admin has no authenticator yet: set it up now (QR + recovery codes) before anything else.
  final bool totpSetupRequired;

  Map<String, Object?> toJson() => _$AdminLoginVerifyResultDtoToJson(this);
}
