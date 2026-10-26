// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'legal_export_dto.g.dart';

@JsonSerializable()
class LegalExportDto {
  const LegalExportDto({
    required this.id,
    required this.requestId,
    required this.subjectUserId,
    required this.requestedBy,
    required this.status,
    required this.selection,
    required this.rowCounts,
    required this.sizeBytes,
    required this.sha256,
    required this.error,
    required this.createdAt,
    required this.finishedAt,
    required this.expiresAt,
  });

  factory LegalExportDto.fromJson(Map<String, Object?> json) =>
      _$LegalExportDtoFromJson(json);

  final String id;
  final String requestId;
  final String subjectUserId;
  final String requestedBy;

  /// queued | running | ready | failed | expired
  final String status;
  final dynamic selection;
  final Map<String, num>? rowCounts;
  final num? sizeBytes;
  final String? sha256;
  final String? error;
  final String createdAt;
  final String? finishedAt;
  final String? expiresAt;

  Map<String, Object?> toJson() => _$LegalExportDtoToJson(this);
}
