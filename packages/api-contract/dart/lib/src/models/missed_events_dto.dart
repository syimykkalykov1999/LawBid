// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'missed_event_dto.dart';

part 'missed_events_dto.g.dart';

@JsonSerializable()
class MissedEventsDto {
  const MissedEventsDto({
    required this.seq,
    required this.events,
    required this.complete,
  });

  factory MissedEventsDto.fromJson(Map<String, Object?> json) =>
      _$MissedEventsDtoFromJson(json);

  /// Newest cursor; continue from it.
  final num seq;
  final List<MissedEventDto> events;

  /// false: events are gone (gap over 5 minutes or over 200 events) — do one full refresh, then continue from `seq`.
  final bool complete;

  Map<String, Object?> toJson() => _$MissedEventsDtoToJson(this);
}
