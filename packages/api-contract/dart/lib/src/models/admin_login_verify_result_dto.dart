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
  });

  factory AdminLoginVerifyResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminLoginVerifyResultDtoFromJson(json);

  /// Only when this admin turned on two-factor: exchange it with the authenticator code (or a recovery code) at /totp.
  final String? ticket;

  /// The signed-in session when no second step is needed (two-factor off, the default).
  final AdminSessionDto? session;

  Map<String, Object?> toJson() => _$AdminLoginVerifyResultDtoToJson(this);
}
