// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'calendar_feed_link_dto.g.dart';

@JsonSerializable()
class CalendarFeedLinkDto {
  const CalendarFeedLinkDto({
    required this.url,
    required this.webcalUrl,
    required this.createdAt,
  });

  factory CalendarFeedLinkDto.fromJson(Map<String, Object?> json) =>
      _$CalendarFeedLinkDtoFromJson(json);

  /// https link of the .ics feed. Shown ONCE: only a hash is kept. Anyone with the link sees the calendar; create a new link to revoke the old.
  final String url;

  /// The same link with webcal:// (one tap in Apple Calendar).
  final String webcalUrl;
  final String createdAt;

  Map<String, Object?> toJson() => _$CalendarFeedLinkDtoToJson(this);
}
