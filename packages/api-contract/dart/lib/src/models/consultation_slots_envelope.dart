// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'consultation_slots_dto.dart';
import 'response_meta_dto.dart';

part 'consultation_slots_envelope.g.dart';

@JsonSerializable()
class ConsultationSlotsEnvelope {
  const ConsultationSlotsEnvelope({required this.data, this.meta});

  factory ConsultationSlotsEnvelope.fromJson(Map<String, Object?> json) =>
      _$ConsultationSlotsEnvelopeFromJson(json);

  final ConsultationSlotsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ConsultationSlotsEnvelopeToJson(this);
}
