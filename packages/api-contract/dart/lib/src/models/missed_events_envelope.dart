// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'missed_events_dto.dart';
import 'response_meta_dto.dart';

part 'missed_events_envelope.g.dart';

@JsonSerializable()
class MissedEventsEnvelope {
  const MissedEventsEnvelope({required this.data, this.meta});

  factory MissedEventsEnvelope.fromJson(Map<String, Object?> json) =>
      _$MissedEventsEnvelopeFromJson(json);

  final MissedEventsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MissedEventsEnvelopeToJson(this);
}
