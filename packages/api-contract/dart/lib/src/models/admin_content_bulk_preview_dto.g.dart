// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_content_bulk_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminContentBulkPreviewDto _$AdminContentBulkPreviewDtoFromJson(
  Map<String, dynamic> json,
) => AdminContentBulkPreviewDto(
  type: AdminBulkContentType.fromJson(json['type'] as String),
  filter: AdminContentBulkFilterDto.fromJson(
    json['filter'] as Map<String, dynamic>,
  ),
);

Map<String, dynamic> _$AdminContentBulkPreviewDtoToJson(
  AdminContentBulkPreviewDto instance,
) => <String, dynamic>{
  'type': instance.type.toJson(),
  'filter': instance.filter.toJson(),
};
