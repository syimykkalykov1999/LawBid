// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_partner_team_member_dto_status.dart';
import 'permissions_permissions.dart';

part 'country_partner_team_member_dto.g.dart';

@JsonSerializable()
class CountryPartnerTeamMemberDto {
  const CountryPartnerTeamMemberDto({
    required this.id,
    required this.email,
    required this.role,
    required this.status,
    required this.lead,
    required this.permissions,
    required this.lastLoginAt,
  });

  factory CountryPartnerTeamMemberDto.fromJson(Map<String, Object?> json) =>
      _$CountryPartnerTeamMemberDtoFromJson(json);

  final String id;
  final String email;
  final String role;
  final CountryPartnerTeamMemberDtoStatus status;
  final bool lead;
  final Map<String, PermissionsPermissions> permissions;
  final DateTime? lastLoginAt;

  Map<String, Object?> toJson() => _$CountryPartnerTeamMemberDtoToJson(this);
}
