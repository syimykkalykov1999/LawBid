// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'template_bulk_action.dart';

part 'admin_templates_bulk_dto.g.dart';

@JsonSerializable()
class AdminTemplatesBulkDto {
  const AdminTemplatesBulkDto({required this.ids, required this.action});

  factory AdminTemplatesBulkDto.fromJson(Map<String, Object?> json) =>
      _$AdminTemplatesBulkDtoFromJson(json);

  final List<String> ids;
  final TemplateBulkAction action;

  Map<String, Object?> toJson() => _$AdminTemplatesBulkDtoToJson(this);
}
