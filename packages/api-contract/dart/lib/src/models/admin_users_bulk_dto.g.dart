// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_users_bulk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUsersBulkDto _$AdminUsersBulkDtoFromJson(Map<String, dynamic> json) =>
    AdminUsersBulkDto(
      action: AdminUsersBulkAction.fromJson(json['action'] as String),
      ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
      reason: json['reason'] as String? ?? '',
    );

Map<String, dynamic> _$AdminUsersBulkDtoToJson(AdminUsersBulkDto instance) =>
    <String, dynamic>{
      'action': instance.action.toJson(),
      'ids': instance.ids,
      'reason': instance.reason,
    };
