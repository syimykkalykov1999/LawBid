// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'calendar_connect_start_dto.dart';
import 'response_meta_dto.dart';

part 'calendar_connect_start_envelope.g.dart';

@JsonSerializable()
class CalendarConnectStartEnvelope {
  const CalendarConnectStartEnvelope({required this.data, this.meta});

  factory CalendarConnectStartEnvelope.fromJson(Map<String, Object?> json) =>
      _$CalendarConnectStartEnvelopeFromJson(json);

  final CalendarConnectStartDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CalendarConnectStartEnvelopeToJson(this);
}
