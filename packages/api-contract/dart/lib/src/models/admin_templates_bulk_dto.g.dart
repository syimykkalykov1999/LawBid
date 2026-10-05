// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_templates_bulk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTemplatesBulkDto _$AdminTemplatesBulkDtoFromJson(
  Map<String, dynamic> json,
) => AdminTemplatesBulkDto(
  ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
  action: TemplateBulkAction.fromJson(json['action'] as String),
);

Map<String, dynamic> _$AdminTemplatesBulkDtoToJson(
  AdminTemplatesBulkDto instance,
) => <String, dynamic>{'ids': instance.ids, 'action': instance.action.toJson()};
