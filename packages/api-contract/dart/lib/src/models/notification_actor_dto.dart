// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'notification_actor_dto.g.dart';

@JsonSerializable()
class NotificationActorDto {
  const NotificationActorDto({
    required this.displayName,
    this.id,
    this.username,
    this.avatarUrl,
  });

  factory NotificationActorDto.fromJson(Map<String, Object?> json) =>
      _$NotificationActorDtoFromJson(json);

  /// null for a client (no public profile).
  final String? id;
  final String displayName;
  final String? username;
  final String? avatarUrl;

  Map<String, Object?> toJson() => _$NotificationActorDtoToJson(this);
}
