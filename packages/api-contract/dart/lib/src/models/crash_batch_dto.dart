// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'crash_report_in_dto.dart';

part 'crash_batch_dto.g.dart';

@JsonSerializable()
class CrashBatchDto {
  const CrashBatchDto({required this.reports});

  factory CrashBatchDto.fromJson(Map<String, Object?> json) =>
      _$CrashBatchDtoFromJson(json);

  final List<CrashReportInDto> reports;

  Map<String, Object?> toJson() => _$CrashBatchDtoToJson(this);
}
