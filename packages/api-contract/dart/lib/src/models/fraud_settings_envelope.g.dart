// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudSettingsEnvelope _$FraudSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => FraudSettingsEnvelope(
  data: FraudSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FraudSettingsEnvelopeToJson(
  FraudSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
