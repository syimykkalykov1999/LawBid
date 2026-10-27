// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sms_disclosure_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SmsDisclosureEnvelope _$SmsDisclosureEnvelopeFromJson(
  Map<String, dynamic> json,
) => SmsDisclosureEnvelope(
  data: SmsDisclosureDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SmsDisclosureEnvelopeToJson(
  SmsDisclosureEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
