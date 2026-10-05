// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_region_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryRegionDto _$CountryRegionDtoFromJson(Map<String, dynamic> json) =>
    CountryRegionDto(
      code: json['code'] as String,
      name: json['name'] as String,
      isoCode: json['isoCode'] as String?,
    );

Map<String, dynamic> _$CountryRegionDtoToJson(CountryRegionDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'name': instance.name,
      'isoCode': ?instance.isoCode,
    };
