// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'calendar_feed_link_dto.dart';
import 'response_meta_dto.dart';

part 'calendar_feed_link_envelope.g.dart';

@JsonSerializable()
class CalendarFeedLinkEnvelope {
  const CalendarFeedLinkEnvelope({required this.data, this.meta});

  factory CalendarFeedLinkEnvelope.fromJson(Map<String, Object?> json) =>
      _$CalendarFeedLinkEnvelopeFromJson(json);

  final CalendarFeedLinkDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CalendarFeedLinkEnvelopeToJson(this);
}
