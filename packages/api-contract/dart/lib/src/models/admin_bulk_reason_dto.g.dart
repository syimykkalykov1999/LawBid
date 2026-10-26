// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_bulk_reason_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBulkReasonDto _$AdminBulkReasonDtoFromJson(Map<String, dynamic> json) =>
    AdminBulkReasonDto(
      ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
      reason: json['reason'] as String? ?? '',
    );

Map<String, dynamic> _$AdminBulkReasonDtoToJson(AdminBulkReasonDto instance) =>
    <String, dynamic>{'reason': instance.reason, 'ids': instance.ids};
