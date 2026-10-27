// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_users_bulk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUsersBulkDto _$AdminUsersBulkDtoFromJson(Map<String, dynamic> json) =>
    AdminUsersBulkDto(
      action: AdminUsersBulkAction.fromJson(json['action'] as String),
      reason: json['reason'] as String? ?? '',
      ids: (json['ids'] as List<dynamic>?)?.map((e) => e as String).toList(),
      filter: json['filter'] == null
          ? null
          : AdminUsersFilterDto.fromJson(
              json['filter'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$AdminUsersBulkDtoToJson(AdminUsersBulkDto instance) =>
    <String, dynamic>{
      'action': instance.action.toJson(),
      'ids': ?instance.ids,
      'filter': ?instance.filter?.toJson(),
      'reason': instance.reason,
    };
