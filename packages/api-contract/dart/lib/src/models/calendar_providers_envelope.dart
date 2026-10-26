// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'calendar_providers_dto.dart';
import 'response_meta_dto.dart';

part 'calendar_providers_envelope.g.dart';

@JsonSerializable()
class CalendarProvidersEnvelope {
  const CalendarProvidersEnvelope({required this.data, this.meta});

  factory CalendarProvidersEnvelope.fromJson(Map<String, Object?> json) =>
      _$CalendarProvidersEnvelopeFromJson(json);

  final CalendarProvidersDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CalendarProvidersEnvelopeToJson(this);
}
