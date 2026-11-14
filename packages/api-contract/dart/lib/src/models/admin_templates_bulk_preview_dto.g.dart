// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_templates_bulk_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTemplatesBulkPreviewDto _$AdminTemplatesBulkPreviewDtoFromJson(
  Map<String, dynamic> json,
) => AdminTemplatesBulkPreviewDto(
  filter: AdminTemplatesFilterDto.fromJson(
    json['filter'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$AdminTemplatesBulkPreviewDtoToJson(
  AdminTemplatesBulkPreviewDto instance,
) => <String, dynamic>{'filter': instance.filter.toJson()};
