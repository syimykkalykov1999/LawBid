// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'countries_admin_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountriesAdminDto _$CountriesAdminDtoFromJson(Map<String, dynamic> json) =>
    CountriesAdminDto(
      countries: (json['countries'] as List<dynamic>)
          .map((e) => CountryAdminDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      notifyWaitlist: json['notifyWaitlist'] as bool,
      canBulk: json['canBulk'] as bool,
    );

Map<String, dynamic> _$CountriesAdminDtoToJson(CountriesAdminDto instance) =>
    <String, dynamic>{
      'countries': instance.countries.map((e) => e.toJson()).toList(),
      'notifyWaitlist': instance.notifyWaitlist,
      'canBulk': instance.canBulk,
    };
