// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_history_export_dto.dart';
import 'response_meta_dto.dart';

part 'case_history_export_envelope.g.dart';

@JsonSerializable()
class CaseHistoryExportEnvelope {
  const CaseHistoryExportEnvelope({required this.data, this.meta});

  factory CaseHistoryExportEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseHistoryExportEnvelopeFromJson(json);

  final CaseHistoryExportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseHistoryExportEnvelopeToJson(this);
}
