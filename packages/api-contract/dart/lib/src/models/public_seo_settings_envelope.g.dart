// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_seo_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicSeoSettingsEnvelope _$PublicSeoSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => PublicSeoSettingsEnvelope(
  data: PublicSeoSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PublicSeoSettingsEnvelopeToJson(
  PublicSeoSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
