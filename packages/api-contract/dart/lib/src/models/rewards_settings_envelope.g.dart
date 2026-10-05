// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'rewards_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RewardsSettingsEnvelope _$RewardsSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => RewardsSettingsEnvelope(
  data: RewardsSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RewardsSettingsEnvelopeToJson(
  RewardsSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
