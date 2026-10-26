// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_license_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLicenseDto _$AdminLicenseDtoFromJson(
  Map<String, dynamic> json,
) => AdminLicenseDto(
  id: json['id'] as String,
  stateCode: json['stateCode'] as String,
  stateName: json['stateName'] as String,
  barNumber: json['barNumber'] as String,
  status: LicenseStatus.fromJson(json['status'] as String),
  expiresAt: json['expiresAt'] == null
      ? null
      : DateTime.parse(json['expiresAt'] as String),
  expiresSource: json['expiresSource'] == null
      ? null
      : AdminLicenseDtoExpiresSource.fromJson(json['expiresSource'] as String),
  renewalState: json['renewalState'] == null
      ? null
      : AdminLicenseDtoRenewalState.fromJson(json['renewalState'] as String),
  graceEndsAt: json['graceEndsAt'] == null
      ? null
      : DateTime.parse(json['graceEndsAt'] as String),
  autoCheckResult: json['autoCheckResult'],
  lookupUrl: json['lookupUrl'] as String?,
  rejectionCode: json['rejectionCode'] as String?,
  rejectionNote: json['rejectionNote'] as String?,
  verifiedAt: json['verifiedAt'] == null
      ? null
      : DateTime.parse(json['verifiedAt'] as String),
  decidedBy: json['decidedBy'] as String?,
  registryFlag: json['registryFlag'] == null
      ? null
      : AdminLicenseDtoRegistryFlag.fromJson(json['registryFlag'] as String),
  registryFlaggedAt: json['registryFlaggedAt'] == null
      ? null
      : DateTime.parse(json['registryFlaggedAt'] as String),
);

Map<String, dynamic> _$AdminLicenseDtoToJson(AdminLicenseDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'stateCode': instance.stateCode,
      'stateName': instance.stateName,
      'barNumber': instance.barNumber,
      'status': instance.status.toJson(),
      'expiresAt': ?instance.expiresAt?.toIso8601String(),
      'expiresSource': ?instance.expiresSource?.toJson(),
      'renewalState': ?instance.renewalState?.toJson(),
      'graceEndsAt': ?instance.graceEndsAt?.toIso8601String(),
      'autoCheckResult': ?instance.autoCheckResult,
      'lookupUrl': ?instance.lookupUrl,
      'rejectionCode': ?instance.rejectionCode,
      'rejectionNote': ?instance.rejectionNote,
      'verifiedAt': ?instance.verifiedAt?.toIso8601String(),
      'decidedBy': ?instance.decidedBy,
      'registryFlag': ?instance.registryFlag?.toJson(),
      'registryFlaggedAt': ?instance.registryFlaggedAt?.toIso8601String(),
    };
