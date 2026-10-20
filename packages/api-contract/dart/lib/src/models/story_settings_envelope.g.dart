// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'story_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StorySettingsEnvelope _$StorySettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => StorySettingsEnvelope(
  data: StorySettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StorySettingsEnvelopeToJson(
  StorySettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
