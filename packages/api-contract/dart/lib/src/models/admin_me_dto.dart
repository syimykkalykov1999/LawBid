// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_country_tab_dto.dart';
import 'admin_me_dto_role.dart';
import 'permissions_permissions.dart';

part 'admin_me_dto.g.dart';

@JsonSerializable()
class AdminMeDto {
  const AdminMeDto({
    required this.id,
    required this.email,
    required this.role,
    required this.totpEnabled,
    required this.lastLoginAt,
    required this.login,
    required this.hasPassword,
    required this.permissions,
    required this.hasSecurityQuestion,
    required this.canManageAdmins,
    required this.countryPartnerId,
    required this.partnerLead,
    required this.countries,
    required this.countryTabs,
    required this.securityQuestion,
    required this.reasonRequiredAreas,
  });

  factory AdminMeDto.fromJson(Map<String, Object?> json) =>
      _$AdminMeDtoFromJson(json);

  final String id;
  final String email;
  final AdminMeDtoRole role;
  final bool totpEnabled;
  final DateTime? lastLoginAt;

  /// Login, if set.
  final String? login;

  /// A password is set.
  final bool hasPassword;

  /// Area toggles (empty for the super admin, who reaches everything).
  final Map<String, PermissionsPermissions> permissions;

  /// Super admin: a security question is set.
  final bool hasSecurityQuestion;

  /// May create and manage other admins (the super admin always can).
  final bool canManageAdmins;

  /// Owner 2026-10-06: the country partner whose team this admin is in (null = LawBid staff).
  final String? countryPartnerId;

  /// This admin is the country partner themself (hires their team).
  final bool partnerLead;

  /// Owner 2026-10-05: countries this admin works with (ISO 3166-1 alpha-2); empty = every country.
  final List<String> countries;

  /// Country tabs for the panel: the assigned countries, or every switched-on country for staff working everywhere.
  final List<AdminCountryTabDto> countryTabs;
  final String? securityQuestion;

  /// Sections where this admin must write a reason (always empty for the super admin).
  final List<String> reasonRequiredAreas;

  Map<String, Object?> toJson() => _$AdminMeDtoToJson(this);
}
