// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verification_license_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VerificationLicenseDto _$VerificationLicenseDtoFromJson(
  Map<String, dynamic> json,
) => VerificationLicenseDto(
  id: json['id'] as String,
  state: StateRefDto.fromJson(json['state'] as Map<String, dynamic>),
  barNumber: json['barNumber'] as String,
  status: LicenseStatus.fromJson(json['status'] as String),
  expiresAt: json['expiresAt'] == null
      ? null
      : DateTime.parse(json['expiresAt'] as String),
  rejectionCode: json['rejectionCode'] as String?,
  rejectionNote: json['rejectionNote'] as String?,
);

Map<String, dynamic> _$VerificationLicenseDtoToJson(
  VerificationLicenseDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'state': instance.state.toJson(),
  'barNumber': instance.barNumber,
  'status': instance.status.toJson(),
  'expiresAt': ?instance.expiresAt?.toIso8601String(),
  'rejectionCode': ?instance.rejectionCode,
  'rejectionNote': ?instance.rejectionNote,
};
