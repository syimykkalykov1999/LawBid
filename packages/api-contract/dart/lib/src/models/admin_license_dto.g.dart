// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_license_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLicenseDto _$AdminLicenseDtoFromJson(Map<String, dynamic> json) =>
    AdminLicenseDto(
      id: json['id'] as String,
      stateCode: json['stateCode'] as String,
      stateName: json['stateName'] as String,
      barNumber: json['barNumber'] as String,
      status: LicenseStatus.fromJson(json['status'] as String),
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
      autoCheckResult: json['autoCheckResult'],
      rejectionCode: json['rejectionCode'] as String?,
      rejectionNote: json['rejectionNote'] as String?,
      verifiedAt: json['verifiedAt'] == null
          ? null
          : DateTime.parse(json['verifiedAt'] as String),
      decidedBy: json['decidedBy'] as String?,
    );

Map<String, dynamic> _$AdminLicenseDtoToJson(AdminLicenseDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'stateCode': instance.stateCode,
      'stateName': instance.stateName,
      'barNumber': instance.barNumber,
      'status': instance.status.toJson(),
      'expiresAt': ?instance.expiresAt?.toIso8601String(),
      'autoCheckResult': ?instance.autoCheckResult,
      'rejectionCode': ?instance.rejectionCode,
      'rejectionNote': ?instance.rejectionNote,
      'verifiedAt': ?instance.verifiedAt?.toIso8601String(),
      'decidedBy': ?instance.decidedBy,
    };
