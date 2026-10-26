// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_desk_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportDeskSettingsEnvelope _$SupportDeskSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => SupportDeskSettingsEnvelope(
  data: SupportDeskSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SupportDeskSettingsEnvelopeToJson(
  SupportDeskSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
