// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_client_badge_bulk_approve_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminClientBadgeBulkApproveDto _$AdminClientBadgeBulkApproveDtoFromJson(
  Map<String, dynamic> json,
) => AdminClientBadgeBulkApproveDto(
  ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
  free: json['free'] as bool? ?? false,
);

Map<String, dynamic> _$AdminClientBadgeBulkApproveDtoToJson(
  AdminClientBadgeBulkApproveDto instance,
) => <String, dynamic>{'free': instance.free, 'ids': instance.ids};
