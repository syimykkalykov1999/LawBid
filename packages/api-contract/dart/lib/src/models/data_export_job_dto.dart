// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'data_export_job_dto_status.dart';

part 'data_export_job_dto.g.dart';

@JsonSerializable()
class DataExportJobDto {
  const DataExportJobDto({
    required this.exportId,
    required this.status,
    required this.url,
    required this.expiresAt,
    required this.createdAt,
  });

  factory DataExportJobDto.fromJson(Map<String, Object?> json) =>
      _$DataExportJobDtoFromJson(json);

  final String exportId;
  final DataExportJobDtoStatus status;

  /// Signed download link while the export is ready (24 hours from completion); also sent by email.
  final String? url;
  final DateTime? expiresAt;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$DataExportJobDtoToJson(this);
}
