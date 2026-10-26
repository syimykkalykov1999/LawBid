// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_update_dto.dart';
import 'response_meta_dto.dart';

part 'case_update_list_envelope.g.dart';

@JsonSerializable()
class CaseUpdateListEnvelope {
  const CaseUpdateListEnvelope({required this.data, this.meta});

  factory CaseUpdateListEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseUpdateListEnvelopeFromJson(json);

  final List<CaseUpdateDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseUpdateListEnvelopeToJson(this);
}
