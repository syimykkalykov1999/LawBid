// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_history_export_dto_status.dart';

part 'case_history_export_dto.g.dart';

@JsonSerializable()
class CaseHistoryExportDto {
  const CaseHistoryExportDto({
    required this.exportId,
    required this.status,
    this.url,
    this.expiresAt,
  });

  factory CaseHistoryExportDto.fromJson(Map<String, Object?> json) =>
      _$CaseHistoryExportDtoFromJson(json);

  final String exportId;
  final CaseHistoryExportDtoStatus status;

  /// Signed download link, valid 10 minutes (status ready).
  final String? url;
  final String? expiresAt;

  Map<String, Object?> toJson() => _$CaseHistoryExportDtoToJson(this);
}
