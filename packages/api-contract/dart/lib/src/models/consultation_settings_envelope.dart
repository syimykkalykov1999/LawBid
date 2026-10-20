// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'consultation_settings_dto.dart';
import 'response_meta_dto.dart';

part 'consultation_settings_envelope.g.dart';

@JsonSerializable()
class ConsultationSettingsEnvelope {
  const ConsultationSettingsEnvelope({required this.data, this.meta});

  factory ConsultationSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$ConsultationSettingsEnvelopeFromJson(json);

  final ConsultationSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ConsultationSettingsEnvelopeToJson(this);
}
