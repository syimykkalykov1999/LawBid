// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'notification_actor_dto.dart';
import 'notification_dto_category.dart';

part 'notification_dto.g.dart';

@JsonSerializable()
class NotificationDto {
  const NotificationDto({
    required this.id,
    required this.type,
    required this.category,
    required this.payload,
    required this.aggregateCount,
    required this.createdAt,
    this.actor,
    this.readAt,
  });

  factory NotificationDto.fromJson(Map<String, Object?> json) =>
      _$NotificationDtoFromJson(json);

  final String id;
  final String type;
  final NotificationDtoCategory category;

  /// Ids and template params for `notif.<type>` (§9.1).
  final dynamic payload;
  final NotificationActorDto? actor;

  /// "Sarah и ещё N" = aggregateCount - 1 (§9.4).
  final num aggregateCount;
  final DateTime? readAt;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$NotificationDtoToJson(this);
}
