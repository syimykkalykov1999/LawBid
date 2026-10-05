// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'registry_check_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RegistryCheckDto _$RegistryCheckDtoFromJson(Map<String, dynamic> json) =>
    RegistryCheckDto(
      license: AdminLicenseDto.fromJson(
        json['license'] as Map<String, dynamic>,
      ),
      result: CheckResult.fromJson(json['result'] as String),
      details: json['details'],
    );

Map<String, dynamic> _$RegistryCheckDtoToJson(RegistryCheckDto instance) =>
    <String, dynamic>{
      'license': instance.license.toJson(),
      'result': instance.result.toJson(),
      'details': ?instance.details,
    };
