// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'e2ee_report_result_dto.g.dart';

@JsonSerializable()
class E2eeReportResultDto {
  const E2eeReportResultDto({
    required this.reportId,
    required this.verified,
    required this.total,
  });

  factory E2eeReportResultDto.fromJson(Map<String, Object?> json) =>
      _$E2eeReportResultDtoFromJson(json);

  final String reportId;

  /// Messages whose franking tag matched.
  final num verified;

  /// Messages handed over in all.
  final num total;

  Map<String, Object?> toJson() => _$E2eeReportResultDtoToJson(this);
}
