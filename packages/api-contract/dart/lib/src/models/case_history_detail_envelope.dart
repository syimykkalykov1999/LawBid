// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_history_detail_dto.dart';
import 'response_meta_dto.dart';

part 'case_history_detail_envelope.g.dart';

@JsonSerializable()
class CaseHistoryDetailEnvelope {
  const CaseHistoryDetailEnvelope({required this.data, this.meta});

  factory CaseHistoryDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseHistoryDetailEnvelopeFromJson(json);

  final CaseHistoryDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseHistoryDetailEnvelopeToJson(this);
}
