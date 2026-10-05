// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalSettingsEnvelope _$LegalSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => LegalSettingsEnvelope(
  data: LegalSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LegalSettingsEnvelopeToJson(
  LegalSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
