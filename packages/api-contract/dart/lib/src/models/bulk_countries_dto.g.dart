// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bulk_countries_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BulkCountriesDto _$BulkCountriesDtoFromJson(Map<String, dynamic> json) =>
    BulkCountriesDto(
      enabled: json['enabled'] as bool,
      codes: (json['codes'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$BulkCountriesDtoToJson(BulkCountriesDto instance) =>
    <String, dynamic>{'enabled': instance.enabled, 'codes': ?instance.codes};
