// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'container_report_dto.dart';
import 'containers_dto_scale_mode.dart';

part 'containers_dto.g.dart';

@JsonSerializable()
class ContainersDto {
  const ContainersDto({
    required this.onAws,
    required this.api,
    required this.worker,
    this.scaleMode,
  });

  factory ContainersDto.fromJson(Map<String, Object?> json) =>
      _$ContainersDtoFromJson(json);

  /// ECS actions work here (on AWS).
  final bool onAws;
  final ContainerReportDto api;
  final ContainerReportDto worker;
  final ContainersDtoScaleMode? scaleMode;

  Map<String, Object?> toJson() => _$ContainersDtoToJson(this);
}
