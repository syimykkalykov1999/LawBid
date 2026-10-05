// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_bulk_skipped_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBulkSkippedDto _$AdminBulkSkippedDtoFromJson(Map<String, dynamic> json) =>
    AdminBulkSkippedDto(
      id: json['id'] as String,
      reason: AdminBulkSkippedDtoReason.fromJson(json['reason'] as String),
    );

Map<String, dynamic> _$AdminBulkSkippedDtoToJson(
  AdminBulkSkippedDto instance,
) => <String, dynamic>{'id': instance.id, 'reason': instance.reason.toJson()};
