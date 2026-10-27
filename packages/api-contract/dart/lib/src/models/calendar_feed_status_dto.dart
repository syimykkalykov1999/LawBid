// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'calendar_feed_status_dto.g.dart';

@JsonSerializable()
class CalendarFeedStatusDto {
  const CalendarFeedStatusDto({
    required this.enabled,
    required this.hasLink,
    this.createdAt,
    this.lastUsedAt,
  });

  factory CalendarFeedStatusDto.fromJson(Map<String, Object?> json) =>
      _$CalendarFeedStatusDtoFromJson(json);

  /// The feed is switched on for everyone.
  final bool enabled;

  /// The person has an active secret link.
  final bool hasLink;
  final String? createdAt;
  final String? lastUsedAt;

  Map<String, Object?> toJson() => _$CalendarFeedStatusDtoToJson(this);
}
