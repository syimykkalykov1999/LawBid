// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_client_badge_bulk_reject_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminClientBadgeBulkRejectDto _$AdminClientBadgeBulkRejectDtoFromJson(
  Map<String, dynamic> json,
) => AdminClientBadgeBulkRejectDto(
  reason: json['reason'] as String,
  ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$AdminClientBadgeBulkRejectDtoToJson(
  AdminClientBadgeBulkRejectDto instance,
) => <String, dynamic>{'reason': instance.reason, 'ids': instance.ids};
