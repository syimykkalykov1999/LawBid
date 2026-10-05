// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_user_license_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUserLicenseDto _$AdminUserLicenseDtoFromJson(Map<String, dynamic> json) =>
    AdminUserLicenseDto(
      stateCode: json['stateCode'] as String,
      barNumber: json['barNumber'] as String,
      status: json['status'] as String,
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$AdminUserLicenseDtoToJson(
  AdminUserLicenseDto instance,
) => <String, dynamic>{
  'stateCode': instance.stateCode,
  'barNumber': instance.barNumber,
  'status': instance.status,
  'expiresAt': ?instance.expiresAt?.toIso8601String(),
};
