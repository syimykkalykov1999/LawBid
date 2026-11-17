// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'data_export_job_dto_status.dart';
import 'progress.dart';

part 'data_export_job_dto.g.dart';

@JsonSerializable()
class DataExportJobDto {
  const DataExportJobDto({
    required this.exportId,
    required this.status,
    required this.url,
    required this.expiresAt,
    required this.createdAt,
    this.progress,
  });

  factory DataExportJobDto.fromJson(Map<String, Object?> json) =>
      _$DataExportJobDtoFromJson(json);

  final String exportId;
  final DataExportJobDtoStatus status;

  /// Signed download link while the export is ready (24 hours from completion); also sent by email. Null on a ready export read without a fresh X-Reauth-Token once security.export_reauth_min_app_version covers the app: re-authenticate and read again.
  final String? url;
  final DateTime? expiresAt;
  final DateTime createdAt;

  /// While the export is being built: rows written and bytes so far.
  final Progress? progress;

  Map<String, Object?> toJson() => _$DataExportJobDtoToJson(this);
}
