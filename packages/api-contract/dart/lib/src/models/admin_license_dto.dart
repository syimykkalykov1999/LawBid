// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_license_dto_registry_flag.dart';
import 'license_status.dart';

part 'admin_license_dto.g.dart';

@JsonSerializable()
class AdminLicenseDto {
  const AdminLicenseDto({
    required this.id,
    required this.stateCode,
    required this.stateName,
    required this.barNumber,
    required this.status,
    required this.expiresAt,
    required this.autoCheckResult,
    required this.lookupUrl,
    required this.rejectionCode,
    required this.rejectionNote,
    required this.verifiedAt,
    required this.decidedBy,
    required this.registryFlag,
    required this.registryFlaggedAt,
  });

  factory AdminLicenseDto.fromJson(Map<String, Object?> json) =>
      _$AdminLicenseDtoFromJson(json);

  final String id;
  final String stateCode;
  final String stateName;
  final String barNumber;
  final LicenseStatus status;
  final DateTime? expiresAt;

  /// Latest automatic bar lookup (§2.4), null if none ran.
  final dynamic autoCheckResult;

  /// The state bar's public lookup page for this license (profile page when the state has one per number).
  final String? lookupUrl;
  final String? rejectionCode;
  final String? rejectionNote;
  final DateTime? verifiedAt;
  final String? decidedBy;

  /// Owner 2026-10-05: the state registry disagreed with this verified license (it stays verified).
  final AdminLicenseDtoRegistryFlag? registryFlag;
  final DateTime? registryFlaggedAt;

  Map<String, Object?> toJson() => _$AdminLicenseDtoToJson(this);
}
