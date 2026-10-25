// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_users_filter_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUsersFilterDto _$AdminUsersFilterDtoFromJson(Map<String, dynamic> json) =>
    AdminUsersFilterDto(
      q: json['q'] as String?,
      role: json['role'] == null
          ? null
          : AdminUsersFilterDtoRole.fromJson(json['role'] as String),
      status: json['status'] == null
          ? null
          : AdminUsersFilterDtoStatus.fromJson(json['status'] as String),
      stateCode: json['stateCode'] as String?,
      countryCode: json['countryCode'] as String?,
      from: json['from'] == null
          ? null
          : DateTime.parse(json['from'] as String),
      to: json['to'] == null ? null : DateTime.parse(json['to'] as String),
    );

Map<String, dynamic> _$AdminUsersFilterDtoToJson(
  AdminUsersFilterDto instance,
) => <String, dynamic>{
  'q': ?instance.q,
  'role': ?instance.role?.toJson(),
  'status': ?instance.status?.toJson(),
  'stateCode': ?instance.stateCode,
  'countryCode': ?instance.countryCode,
  'from': ?instance.from?.toIso8601String(),
  'to': ?instance.to?.toIso8601String(),
};
