// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'add_license_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AddLicenseDto _$AddLicenseDtoFromJson(Map<String, dynamic> json) =>
    AddLicenseDto(
      stateCode: json['stateCode'] as String,
      barNumber: json['barNumber'] as String,
      expiresAt: json['expiresAt'] as String?,
      renewal: json['renewal'] as bool?,
    );

Map<String, dynamic> _$AddLicenseDtoToJson(AddLicenseDto instance) =>
    <String, dynamic>{
      'stateCode': instance.stateCode,
      'barNumber': instance.barNumber,
      'expiresAt': ?instance.expiresAt,
      'renewal': ?instance.renewal,
    };
