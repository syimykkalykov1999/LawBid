// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'consultation_dto.dart';
import 'response_meta_dto.dart';

part 'consultation_list_envelope.g.dart';

@JsonSerializable()
class ConsultationListEnvelope {
  const ConsultationListEnvelope({required this.data, this.meta});

  factory ConsultationListEnvelope.fromJson(Map<String, Object?> json) =>
      _$ConsultationListEnvelopeFromJson(json);

  final List<ConsultationDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ConsultationListEnvelopeToJson(this);
}
