// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'push_token_dto_platform.dart';

part 'push_token_dto.g.dart';

@JsonSerializable()
class PushTokenDto {
  const PushTokenDto({
    required this.token,
    required this.platform,
    this.localReminders,
    this.chatStyle,
    this.actorStyle,
  });

  factory PushTokenDto.fromJson(Map<String, Object?> json) =>
      _$PushTokenDtoFromJson(json);

  /// FCM registration token.
  final String token;
  final PushTokenDtoPlatform platform;

  /// Owner 2026-10-20: this app keeps planner reminders locally and shows the reminder push itself (Android).
  final bool? localReminders;

  /// Owner 2026-10-22: this app draws chat notifications itself (sender's photo, one per chat) from a data-only push (Android).
  final bool? chatStyle;

  /// Owner 2026-10-26: this app draws notifications with a person (bid, comment, like, missed call …) itself, with the person's round photo, from a data-only push (Android).
  final bool? actorStyle;

  Map<String, Object?> toJson() => _$PushTokenDtoToJson(this);
}
