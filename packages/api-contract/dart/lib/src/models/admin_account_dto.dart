// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_account_dto_role.dart';
import 'admin_account_dto_status.dart';
import 'permissions_permissions.dart';

part 'admin_account_dto.g.dart';

@JsonSerializable()
class AdminAccountDto {
  const AdminAccountDto({
    required this.id,
    required this.email,
    required this.role,
    required this.status,
    required this.totpEnabled,
    required this.login,
    required this.hasPassword,
    required this.permissions,
    required this.canManageAdmins,
    required this.countries,
    required this.countryPartnerId,
    required this.partnerLead,
    required this.lastLoginAt,
    required this.createdAt,
  });

  factory AdminAccountDto.fromJson(Map<String, Object?> json) =>
      _$AdminAccountDtoFromJson(json);

  final String id;
  final String email;
  final AdminAccountDtoRole role;
  final AdminAccountDtoStatus status;

  /// Authenticator bound.
  final bool totpEnabled;
  final String? login;

  /// A password is set.
  final bool hasPassword;
  final Map<String, PermissionsPermissions> permissions;

  /// May create and manage other admins.
  final bool canManageAdmins;

  /// Countries this admin works with (ISO 3166-1 alpha-2); empty = every country.
  final List<String> countries;

  /// Owner 2026-10-06: the country partner whose team this admin is in (null = LawBid staff).
  final String? countryPartnerId;

  /// This admin is the country partner themself.
  final bool partnerLead;
  final DateTime? lastLoginAt;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminAccountDtoToJson(this);
}
