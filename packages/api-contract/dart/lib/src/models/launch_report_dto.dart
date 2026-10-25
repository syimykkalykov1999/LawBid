// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'launch_item_dto.dart';

part 'launch_report_dto.g.dart';

@JsonSerializable()
class LaunchReportDto {
  const LaunchReportDto({
    required this.generatedAt,
    required this.items,
    required this.greenCount,
    required this.total,
  });

  factory LaunchReportDto.fromJson(Map<String, Object?> json) =>
      _$LaunchReportDtoFromJson(json);

  final String generatedAt;
  final List<LaunchItemDto> items;
  final num greenCount;
  final num total;

  Map<String, Object?> toJson() => _$LaunchReportDtoToJson(this);
}
