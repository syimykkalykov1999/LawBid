// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'missed_event_dto.g.dart';

@JsonSerializable()
class MissedEventDto {
  const MissedEventDto({
    required this.seq,
    required this.event,
    this.data,
    this.truncated,
  });

  factory MissedEventDto.fromJson(Map<String, Object?> json) =>
      _$MissedEventDtoFromJson(json);

  /// Cursor of the event (increasing, not contiguous).
  final num seq;

  /// The realtime event name, e.g. message:new.
  final String event;

  /// The payload the socket event carried (including `seq`).
  final dynamic data;

  /// true: the payload was too big to keep — refetch that screen.
  final bool? truncated;

  Map<String, Object?> toJson() => _$MissedEventDtoToJson(this);
}
