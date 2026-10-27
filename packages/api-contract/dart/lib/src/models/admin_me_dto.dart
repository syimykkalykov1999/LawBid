// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_country_tab_dto.dart';
import 'admin_me_dto_role.dart';
import 'admin_me_dto_workspace.dart';
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
    required this.noPii,
    required this.countryPartnerId,
    required this.partnerLead,
    required this.countries,
    required this.workspace,
    required this.workspaceHead,
    required this.workspacesEnabled,
    required this.countryTabs,
    required this.securityQuestion,
    required this.reasonRequiredAreas,
    this.passkeyCount,
    this.onCallAvailable,
    this.onCallEnabled,
  });

  factory AdminMeDto.fromJson(Map<String, Object?> json) =>
      _$AdminMeDtoFromJson(json);

  final String id;
  final String email;
  final AdminMeDtoRole role;
  final bool totpEnabled;

  /// Owner 2026-10-22: passkeys enrolled for the admin sign-in.
  final int? passkeyCount;
  final DateTime? lastLoginAt;

  /// Login, if set.
  final String? login;

  /// A password is set.
  final bool hasPassword;

  /// Owner 2026-10-22: the admin may get system alerts (owner, or holds the «Дежурный» right).
  final bool? onCallAvailable;

  /// Owner 2026-10-22: the admin’s own switch for those alerts.
  final bool? onCallEnabled;

  /// Area toggles (empty for the super admin, who reaches everything).
  final Map<String, PermissionsPermissions> permissions;

  /// Super admin: a security question is set.
  final bool hasSecurityQuestion;

  /// May create and manage other admins (the super admin always can).
  final bool canManageAdmins;

  /// Owner 2026-10-16: «без персональных данных» — people’s phones, emails and names are masked for this admin.
  final bool noPii;

  /// Owner 2026-10-06: the country partner whose team this admin is in (null = LawBid staff).
  final String? countryPartnerId;

  /// This admin is the country partner themself (hires their team).
  final bool partnerLead;

  /// Owner 2026-10-05: countries this admin works with (ISO 3166-1 alpha-2); empty = every country.
  final List<String> countries;

  /// Staff package: the workspace this admin works in (the super admin is always the owner).
  final AdminMeDtoWorkspace workspace;

  /// Staff package: the head of the workspace, with the head role switched on (staff.head_enabled). Always false while workspaces are off.
  final bool workspaceHead;

  /// Staff package: staff.workspaces_enabled. Off = the panel looks exactly as before (left menu for everyone).
  final bool workspacesEnabled;

  /// Country tabs for the panel: the assigned countries, or every switched-on country for staff working everywhere.
  final List<AdminCountryTabDto> countryTabs;
  final String? securityQuestion;

  /// Sections where this admin must write a reason (always empty for the super admin).
  final List<String> reasonRequiredAreas;

  Map<String, Object?> toJson() => _$AdminMeDtoToJson(this);
}
