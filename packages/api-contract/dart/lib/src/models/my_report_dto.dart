// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_report_dto_status.dart';
import 'my_report_dto_target_type.dart';

part 'my_report_dto.g.dart';

@JsonSerializable()
class MyReportDto {
  const MyReportDto({
    required this.id,
    required this.targetType,
    required this.reason,
    required this.status,
    required this.createdAt,
  });

  factory MyReportDto.fromJson(Map<String, Object?> json) =>
      _$MyReportDtoFromJson(json);

  final String id;
  final MyReportDtoTargetType targetType;
  final String reason;
  final MyReportDtoStatus status;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$MyReportDtoToJson(this);
}
