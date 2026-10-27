// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sms_consent_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SmsConsentResultDto _$SmsConsentResultDtoFromJson(Map<String, dynamic> json) =>
    SmsConsentResultDto(
      recorded: json['recorded'] as bool,
      blockedUntilStart: json['blockedUntilStart'] as bool,
    );

Map<String, dynamic> _$SmsConsentResultDtoToJson(
  SmsConsentResultDto instance,
) => <String, dynamic>{
  'recorded': instance.recorded,
  'blockedUntilStart': instance.blockedUntilStart,
};
