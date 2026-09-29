// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'report_reason.dart';
import 'report_target_type.dart';

part 'create_report_dto.g.dart';

@JsonSerializable()
class CreateReportDto {
  const CreateReportDto({
    required this.targetType,
    required this.targetId,
    required this.reason,
    this.note,
  });

  factory CreateReportDto.fromJson(Map<String, Object?> json) =>
      _$CreateReportDtoFromJson(json);

  final ReportTargetType targetType;
  final String targetId;
  final ReportReason reason;
  final String? note;

  Map<String, Object?> toJson() => _$CreateReportDtoToJson(this);
}
