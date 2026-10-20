// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'story_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StoryListEnvelope _$StoryListEnvelopeFromJson(Map<String, dynamic> json) =>
    StoryListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => StoryDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$StoryListEnvelopeToJson(StoryListEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.map((e) => e.toJson()).toList(),
      'meta': ?instance.meta?.toJson(),
    };
