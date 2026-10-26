// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachSettingsEnvelope _$OutreachSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => OutreachSettingsEnvelope(
  data: OutreachSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$OutreachSettingsEnvelopeToJson(
  OutreachSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
