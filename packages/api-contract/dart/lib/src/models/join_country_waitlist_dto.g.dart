// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'join_country_waitlist_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

JoinCountryWaitlistDto _$JoinCountryWaitlistDtoFromJson(
  Map<String, dynamic> json,
) => JoinCountryWaitlistDto(
  countryCode: json['countryCode'] as String,
  email: json['email'] as String,
  locale: json['locale'] as String?,
);

Map<String, dynamic> _$JoinCountryWaitlistDtoToJson(
  JoinCountryWaitlistDto instance,
) => <String, dynamic>{
  'countryCode': instance.countryCode,
  'email': instance.email,
  'locale': ?instance.locale,
};
