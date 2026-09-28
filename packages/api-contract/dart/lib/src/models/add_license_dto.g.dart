// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'add_license_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AddLicenseDto _$AddLicenseDtoFromJson(Map<String, dynamic> json) =>
    AddLicenseDto(
      stateCode: json['stateCode'] as String,
      barNumber: json['barNumber'] as String,
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$AddLicenseDtoToJson(AddLicenseDto instance) =>
    <String, dynamic>{
      'stateCode': instance.stateCode,
      'barNumber': instance.barNumber,
      'expiresAt': ?instance.expiresAt?.toIso8601String(),
    };
