// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_admin_countries_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetAdminCountriesDto _$SetAdminCountriesDtoFromJson(
  Map<String, dynamic> json,
) => SetAdminCountriesDto(
  countries: (json['countries'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$SetAdminCountriesDtoToJson(
  SetAdminCountriesDto instance,
) => <String, dynamic>{'countries': instance.countries};
