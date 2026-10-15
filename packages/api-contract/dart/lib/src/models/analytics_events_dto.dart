// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'app_event_count_dto.dart';

part 'analytics_events_dto.g.dart';

@JsonSerializable()
class AnalyticsEventsDto {
  const AnalyticsEventsDto({
    required this.enabled,
    required this.topEvents,
    required this.topScreens,
  });

  factory AnalyticsEventsDto.fromJson(Map<String, Object?> json) =>
      _$AnalyticsEventsDtoFromJson(json);

  /// The app sends events (flag app_events).
  final bool enabled;
  final List<AppEventCountDto> topEvents;
  final List<AppEventCountDto> topScreens;

  Map<String, Object?> toJson() => _$AnalyticsEventsDtoToJson(this);
}
