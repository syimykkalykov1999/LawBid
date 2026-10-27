// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_users_bulk_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUsersBulkPreviewDto _$AdminUsersBulkPreviewDtoFromJson(
  Map<String, dynamic> json,
) => AdminUsersBulkPreviewDto(
  filter: AdminUsersFilterDto.fromJson(json['filter'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminUsersBulkPreviewDtoToJson(
  AdminUsersBulkPreviewDto instance,
) => <String, dynamic>{'filter': instance.filter.toJson()};
