// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'data_export_job_dto.dart';
import 'response_meta_dto.dart';

part 'data_export_job_envelope.g.dart';

@JsonSerializable()
class DataExportJobEnvelope {
  const DataExportJobEnvelope({required this.data, this.meta});

  factory DataExportJobEnvelope.fromJson(Map<String, Object?> json) =>
      _$DataExportJobEnvelopeFromJson(json);

  final DataExportJobDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DataExportJobEnvelopeToJson(this);
}
