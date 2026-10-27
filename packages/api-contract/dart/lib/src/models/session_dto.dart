// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'session_dto.g.dart';

@JsonSerializable()
class SessionDto {
  const SessionDto({
    required this.sessionId,
    required this.deviceId,
    required this.deviceName,
    required this.platform,
    required this.appVersion,
    required this.lastUsedAt,
    required this.createdAt,
    required this.isCurrent,
    required this.ipHint,
    required this.country,
    required this.browser,
  });

  factory SessionDto.fromJson(Map<String, Object?> json) =>
      _$SessionDtoFromJson(json);

  /// Session chain id (stable across refresh rotations) — the id DELETE /auth/sessions/{id} takes.
  final String sessionId;
  final String? deviceId;
  final String? deviceName;
  final String? platform;
  final String? appVersion;
  final DateTime? lastUsedAt;
  final DateTime createdAt;

  /// True for the session making this request.
  final bool isCurrent;

  /// Masked address the session was last used from (203.0.113.x); null when unknown.
  final String? ipHint;

  /// ISO-3166 alpha-2 country the session was last used from, when the CDN reported it.
  final String? country;

  /// Browser and system label for web sessions ("Chrome · macOS").
  final String? browser;

  Map<String, Object?> toJson() => _$SessionDtoToJson(this);
}
