// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_activity_dto.dart';
import 'response_meta_dto.dart';

part 'case_activity_list_envelope.g.dart';

@JsonSerializable()
class CaseActivityListEnvelope {
  const CaseActivityListEnvelope({required this.data, this.meta});

  factory CaseActivityListEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseActivityListEnvelopeFromJson(json);

  final List<CaseActivityDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseActivityListEnvelopeToJson(this);
}
