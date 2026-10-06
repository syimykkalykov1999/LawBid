// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_team_member_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerTeamMemberDto _$CountryPartnerTeamMemberDtoFromJson(
  Map<String, dynamic> json,
) => CountryPartnerTeamMemberDto(
  id: json['id'] as String,
  email: json['email'] as String,
  role: json['role'] as String,
  status: CountryPartnerTeamMemberDtoStatus.fromJson(json['status'] as String),
  lead: json['lead'] as bool,
  permissions: (json['permissions'] as Map<String, dynamic>).map(
    (k, e) => MapEntry(k, PermissionsPermissions.fromJson(e as String)),
  ),
  lastLoginAt: json['lastLoginAt'] == null
      ? null
      : DateTime.parse(json['lastLoginAt'] as String),
);

Map<String, dynamic> _$CountryPartnerTeamMemberDtoToJson(
  CountryPartnerTeamMemberDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'email': instance.email,
  'role': instance.role,
  'status': instance.status.toJson(),
  'lead': instance.lead,
  'permissions': instance.permissions.map((k, e) => MapEntry(k, e.toJson())),
  'lastLoginAt': ?instance.lastLoginAt?.toIso8601String(),
};
