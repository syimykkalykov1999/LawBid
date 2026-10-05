// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustSettingsEnvelope _$TrustSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => TrustSettingsEnvelope(
  data: TrustSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TrustSettingsEnvelopeToJson(
  TrustSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
