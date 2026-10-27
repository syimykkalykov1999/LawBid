// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sms_consent_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SmsConsentRequestDto _$SmsConsentRequestDtoFromJson(
  Map<String, dynamic> json,
) => SmsConsentRequestDto(
  purpose: json['purpose'] as String,
  disclosureVersion: json['disclosureVersion'] as String,
);

Map<String, dynamic> _$SmsConsentRequestDtoToJson(
  SmsConsentRequestDto instance,
) => <String, dynamic>{
  'purpose': instance.purpose,
  'disclosureVersion': instance.disclosureVersion,
};
