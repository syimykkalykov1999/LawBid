// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_me_dto.dart';

part 'admin_session_dto.g.dart';

@JsonSerializable()
class AdminSessionDto {
  const AdminSessionDto({
    required this.accessToken,
    required this.expiresAt,
    required this.admin,
    this.recoveryCodes,
  });

  factory AdminSessionDto.fromJson(Map<String, Object?> json) =>
      _$AdminSessionDtoFromJson(json);

  /// Admin JWT (Bearer), aud = lawbid-admin.
  final String accessToken;

  /// Absolute expiry (8 h); the session also ends after 30 min idle.
  final DateTime expiresAt;
  final AdminMeDto admin;

  /// Only right after the authenticator was bound: ten one-time recovery codes, shown once.
  final List<String>? recoveryCodes;

  Map<String, Object?> toJson() => _$AdminSessionDtoToJson(this);
}
