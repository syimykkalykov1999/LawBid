// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_templates_filter_dto.dart';
import 'template_bulk_action.dart';

part 'admin_templates_bulk_dto.g.dart';

@JsonSerializable()
class AdminTemplatesBulkDto {
  const AdminTemplatesBulkDto({required this.action, this.ids, this.filter});

  factory AdminTemplatesBulkDto.fromJson(Map<String, Object?> json) =>
      _$AdminTemplatesBulkDtoFromJson(json);

  /// Exactly one of `ids` or `filter`. Staff: at most 100; the owner: any number (processed in chunks).
  final List<String>? ids;

  /// Row 179 B6: «select all by filter» — the templates list filter; the server resolves the ids (staff: at most `admin.bulk_select_cap`) and audits the filter.
  final AdminTemplatesFilterDto? filter;
  final TemplateBulkAction action;

  Map<String, Object?> toJson() => _$AdminTemplatesBulkDtoToJson(this);
}
