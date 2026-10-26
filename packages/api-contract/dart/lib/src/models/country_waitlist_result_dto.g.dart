// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_waitlist_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryWaitlistResultDto _$CountryWaitlistResultDtoFromJson(
  Map<String, dynamic> json,
) => CountryWaitlistResultDto(
  countryCode: json['countryCode'] as String,
  available: json['available'] as bool,
);

Map<String, dynamic> _$CountryWaitlistResultDtoToJson(
  CountryWaitlistResultDto instance,
) => <String, dynamic>{
  'countryCode': instance.countryCode,
  'available': instance.available,
};
