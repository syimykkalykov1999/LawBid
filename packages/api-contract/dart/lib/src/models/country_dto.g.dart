// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryDto _$CountryDtoFromJson(Map<String, dynamic> json) => CountryDto(
  code: json['code'] as String,
  name: json['name'] as String,
  callingCode: json['callingCode'] as String,
  currency: json['currency'] as String,
  language: json['language'] as String,
  regionKind: CountryDtoRegionKind.fromJson(json['regionKind'] as String),
  timezone: json['timezone'] as String?,
  stripeSupported: json['stripeSupported'] as bool,
  regions: (json['regions'] as List<dynamic>)
      .map((e) => CountryRegionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$CountryDtoToJson(CountryDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'name': instance.name,
      'callingCode': instance.callingCode,
      'currency': instance.currency,
      'language': instance.language,
      'regionKind': instance.regionKind.toJson(),
      'timezone': ?instance.timezone,
      'stripeSupported': instance.stripeSupported,
      'regions': instance.regions.map((e) => e.toJson()).toList(),
    };
