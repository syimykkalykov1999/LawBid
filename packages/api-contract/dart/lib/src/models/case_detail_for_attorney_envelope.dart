// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_detail_for_attorney_dto.dart';
import 'response_meta_dto.dart';

part 'case_detail_for_attorney_envelope.g.dart';

@JsonSerializable()
class CaseDetailForAttorneyEnvelope {
  const CaseDetailForAttorneyEnvelope({required this.data, this.meta});

  factory CaseDetailForAttorneyEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseDetailForAttorneyEnvelopeFromJson(json);

  final CaseDetailForAttorneyDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseDetailForAttorneyEnvelopeToJson(this);
}
