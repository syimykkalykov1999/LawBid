// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'calendar_feed_status_dto.dart';
import 'response_meta_dto.dart';

part 'calendar_feed_status_envelope.g.dart';

@JsonSerializable()
class CalendarFeedStatusEnvelope {
  const CalendarFeedStatusEnvelope({required this.data, this.meta});

  factory CalendarFeedStatusEnvelope.fromJson(Map<String, Object?> json) =>
      _$CalendarFeedStatusEnvelopeFromJson(json);

  final CalendarFeedStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CalendarFeedStatusEnvelopeToJson(this);
}
