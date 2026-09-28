// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_dto.dart';
import 'response_meta_dto.dart';

part 'case_envelope.g.dart';

@JsonSerializable()
class CaseEnvelope {
  const CaseEnvelope({required this.data, this.meta});

  factory CaseEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseEnvelopeFromJson(json);

  final CaseDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseEnvelopeToJson(this);
}
