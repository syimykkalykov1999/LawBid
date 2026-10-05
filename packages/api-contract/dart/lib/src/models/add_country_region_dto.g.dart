// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'add_country_region_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AddCountryRegionDto _$AddCountryRegionDtoFromJson(Map<String, dynamic> json) =>
    AddCountryRegionDto(
      code: json['code'] as String,
      name: json['name'] as String,
      isoCode: json['isoCode'] as String?,
    );

Map<String, dynamic> _$AddCountryRegionDtoToJson(
  AddCountryRegionDto instance,
) => <String, dynamic>{
  'code': instance.code,
  'name': instance.name,
  'isoCode': ?instance.isoCode,
};
