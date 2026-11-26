// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'settings_rollout_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SettingsRolloutListEnvelope _$SettingsRolloutListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SettingsRolloutListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SettingsRolloutDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SettingsRolloutListEnvelopeToJson(
  SettingsRolloutListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
