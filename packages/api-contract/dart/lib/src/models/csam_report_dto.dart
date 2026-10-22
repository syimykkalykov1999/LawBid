// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'csam_report_dto_status.dart';

part 'csam_report_dto.g.dart';

@JsonSerializable()
class CsamReportDto {
  const CsamReportDto({
    required this.id,
    required this.checkId,
    required this.status,
    required this.externalReportId,
    required this.error,
    required this.createdAt,
  });

  factory CsamReportDto.fromJson(Map<String, Object?> json) =>
      _$CsamReportDtoFromJson(json);

  final String id;
  final String checkId;
  final CsamReportDtoStatus status;
  final String? externalReportId;
  final String? error;
  final String createdAt;

  Map<String, Object?> toJson() => _$CsamReportDtoToJson(this);
}
