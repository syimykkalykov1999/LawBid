// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bar_lookup_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BarLookupDto _$BarLookupDtoFromJson(Map<String, dynamic> json) => BarLookupDto(
  stateCode: json['stateCode'] as String,
  stateName: json['stateName'] as String,
  barNumber: json['barNumber'] as String,
  licenseStatus: json['licenseStatus'] as String,
  url: json['url'] as String?,
  prefilled: json['prefilled'] as bool,
  blocked: json['blocked'] as bool,
);

Map<String, dynamic> _$BarLookupDtoToJson(BarLookupDto instance) =>
    <String, dynamic>{
      'stateCode': instance.stateCode,
      'stateName': instance.stateName,
      'barNumber': instance.barNumber,
      'licenseStatus': instance.licenseStatus,
      'url': ?instance.url,
      'prefilled': instance.prefilled,
      'blocked': instance.blocked,
    };
