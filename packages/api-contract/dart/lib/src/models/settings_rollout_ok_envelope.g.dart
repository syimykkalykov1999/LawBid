// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'settings_rollout_ok_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SettingsRolloutOkEnvelope _$SettingsRolloutOkEnvelopeFromJson(
  Map<String, dynamic> json,
) => SettingsRolloutOkEnvelope(
  data: SettingsRolloutOkDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SettingsRolloutOkEnvelopeToJson(
  SettingsRolloutOkEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
