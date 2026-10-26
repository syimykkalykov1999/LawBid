// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'privacy_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivacySettingsEnvelope _$PrivacySettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => PrivacySettingsEnvelope(
  data: PrivacySettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PrivacySettingsEnvelopeToJson(
  PrivacySettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
