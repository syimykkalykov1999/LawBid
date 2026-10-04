// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_bulk_content_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBulkContentDto _$AdminBulkContentDtoFromJson(Map<String, dynamic> json) =>
    AdminBulkContentDto(
      reason: json['reason'] as String,
      ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
      action: AdminBulkContentAction.fromJson(json['action'] as String),
      type: AdminBulkContentType.fromJson(json['type'] as String),
    );

Map<String, dynamic> _$AdminBulkContentDtoToJson(
  AdminBulkContentDto instance,
) => <String, dynamic>{
  'reason': instance.reason,
  'ids': instance.ids,
  'action': instance.action.toJson(),
  'type': instance.type.toJson(),
};
