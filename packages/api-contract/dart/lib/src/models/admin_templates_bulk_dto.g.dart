// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_templates_bulk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTemplatesBulkDto _$AdminTemplatesBulkDtoFromJson(
  Map<String, dynamic> json,
) => AdminTemplatesBulkDto(
  action: TemplateBulkAction.fromJson(json['action'] as String),
  ids: (json['ids'] as List<dynamic>?)?.map((e) => e as String).toList(),
  filter: json['filter'] == null
      ? null
      : AdminTemplatesFilterDto.fromJson(
          json['filter'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$AdminTemplatesBulkDtoToJson(
  AdminTemplatesBulkDto instance,
) => <String, dynamic>{
  'ids': ?instance.ids,
  'filter': ?instance.filter?.toJson(),
  'action': instance.action.toJson(),
};
