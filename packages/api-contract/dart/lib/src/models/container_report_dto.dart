// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'container_report_dto.g.dart';

@JsonSerializable()
class ContainerReportDto {
  const ContainerReportDto({
    required this.hardCap,
    required this.taskUsd,
    this.running,
    this.desired,
    this.ceiling,
  });

  factory ContainerReportDto.fromJson(Map<String, Object?> json) =>
      _$ContainerReportDtoFromJson(json);

  final num? running;
  final num? desired;
  final num? ceiling;

  /// The Terraform maximum.
  final num hardCap;

  /// Monthly cost of one task, USD.
  final num taskUsd;

  Map<String, Object?> toJson() => _$ContainerReportDtoToJson(this);
}
