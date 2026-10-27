// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'access_report_row_dto.dart';

part 'access_report_dto.g.dart';

@JsonSerializable()
class AccessReportDto {
  const AccessReportDto({
    required this.month,
    required this.from,
    required this.to,
    required this.total,
    required this.rows,
  });

  factory AccessReportDto.fromJson(Map<String, Object?> json) =>
      _$AccessReportDtoFromJson(json);

  final String month;
  final DateTime from;
  final DateTime to;
  final num total;
  final List<AccessReportRowDto> rows;

  Map<String, Object?> toJson() => _$AccessReportDtoToJson(this);
}
