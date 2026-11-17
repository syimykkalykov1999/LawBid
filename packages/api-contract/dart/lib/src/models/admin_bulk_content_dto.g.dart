// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_bulk_content_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBulkContentDto _$AdminBulkContentDtoFromJson(Map<String, dynamic> json) =>
    AdminBulkContentDto(
      action: AdminBulkContentAction.fromJson(json['action'] as String),
      type: AdminBulkContentType.fromJson(json['type'] as String),
      ids: (json['ids'] as List<dynamic>?)?.map((e) => e as String).toList(),
      filter: json['filter'] == null
          ? null
          : AdminContentBulkFilterDto.fromJson(
              json['filter'] as Map<String, dynamic>,
            ),
      reason: json['reason'] as String? ?? '',
    );

Map<String, dynamic> _$AdminBulkContentDtoToJson(
  AdminBulkContentDto instance,
) => <String, dynamic>{
  'reason': instance.reason,
  'ids': ?instance.ids,
  'filter': ?instance.filter?.toJson(),
  'action': instance.action.toJson(),
  'type': instance.type.toJson(),
};
