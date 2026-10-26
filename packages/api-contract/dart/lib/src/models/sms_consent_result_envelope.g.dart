// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sms_consent_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SmsConsentResultEnvelope _$SmsConsentResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => SmsConsentResultEnvelope(
  data: SmsConsentResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SmsConsentResultEnvelopeToJson(
  SmsConsentResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
