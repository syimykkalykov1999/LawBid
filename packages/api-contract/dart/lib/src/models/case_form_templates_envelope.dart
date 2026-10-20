// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_form_templates_dto.dart';
import 'response_meta_dto.dart';

part 'case_form_templates_envelope.g.dart';

@JsonSerializable()
class CaseFormTemplatesEnvelope {
  const CaseFormTemplatesEnvelope({required this.data, this.meta});

  factory CaseFormTemplatesEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseFormTemplatesEnvelopeFromJson(json);

  final CaseFormTemplatesDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseFormTemplatesEnvelopeToJson(this);
}
