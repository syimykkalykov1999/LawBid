// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_region_admin_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryRegionAdminDto _$CountryRegionAdminDtoFromJson(
  Map<String, dynamic> json,
) => CountryRegionAdminDto(
  code: json['code'] as String,
  name: json['name'] as String,
  isoCode: json['isoCode'] as String?,
  isActive: json['isActive'] as bool,
);

Map<String, dynamic> _$CountryRegionAdminDtoToJson(
  CountryRegionAdminDto instance,
) => <String, dynamic>{
  'code': instance.code,
  'name': instance.name,
  'isoCode': ?instance.isoCode,
  'isActive': instance.isActive,
};
