// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'payment_settings_public_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaymentSettingsPublicEnvelope _$PaymentSettingsPublicEnvelopeFromJson(
  Map<String, dynamic> json,
) => PaymentSettingsPublicEnvelope(
  data: PaymentSettingsPublicDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PaymentSettingsPublicEnvelopeToJson(
  PaymentSettingsPublicEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
