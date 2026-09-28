// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'license_recheck_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LicenseRecheckDto _$LicenseRecheckDtoFromJson(Map<String, dynamic> json) =>
    LicenseRecheckDto(
      license: AdminLicenseDto.fromJson(
        json['license'] as Map<String, dynamic>,
      ),
      result: CheckResult.fromJson(json['result'] as String),
      requestId: json['requestId'] as String?,
    );

Map<String, dynamic> _$LicenseRecheckDtoToJson(LicenseRecheckDto instance) =>
    <String, dynamic>{
      'license': instance.license.toJson(),
      'result': instance.result.toJson(),
      'requestId': ?instance.requestId,
    };
