// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_templates_filter_dto.dart';

part 'admin_templates_bulk_preview_dto.g.dart';

@JsonSerializable()
class AdminTemplatesBulkPreviewDto {
  const AdminTemplatesBulkPreviewDto({required this.filter});

  factory AdminTemplatesBulkPreviewDto.fromJson(Map<String, Object?> json) =>
      _$AdminTemplatesBulkPreviewDtoFromJson(json);

  final AdminTemplatesFilterDto filter;

  Map<String, Object?> toJson() => _$AdminTemplatesBulkPreviewDtoToJson(this);
}
