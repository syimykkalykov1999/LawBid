// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'story_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StoryEnvelope _$StoryEnvelopeFromJson(Map<String, dynamic> json) =>
    StoryEnvelope(
      data: StoryDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$StoryEnvelopeToJson(StoryEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
