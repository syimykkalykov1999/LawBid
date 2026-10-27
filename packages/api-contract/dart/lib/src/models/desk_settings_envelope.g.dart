// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'desk_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeskSettingsEnvelope _$DeskSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => DeskSettingsEnvelope(
  data: DeskSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DeskSettingsEnvelopeToJson(
  DeskSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
