// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_user_session_dto.g.dart';

@JsonSerializable()
class AdminUserSessionDto {
  const AdminUserSessionDto({
    required this.sessionChainId,
    required this.deviceName,
    required this.platform,
    required this.appVersion,
    required this.ip,
    required this.lastUsedAt,
    required this.createdAt,
    required this.pushTokens,
  });

  factory AdminUserSessionDto.fromJson(Map<String, Object?> json) =>
      _$AdminUserSessionDtoFromJson(json);

  final String sessionChainId;
  final String? deviceName;
  final String? platform;
  final String? appVersion;
  final String? ip;
  final DateTime? lastUsedAt;
  final DateTime createdAt;

  /// Push tokens bound to it.
  final int pushTokens;

  Map<String, Object?> toJson() => _$AdminUserSessionDtoToJson(this);
}
