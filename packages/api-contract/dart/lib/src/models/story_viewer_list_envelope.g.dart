// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'story_viewer_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StoryViewerListEnvelope _$StoryViewerListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StoryViewerListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => StoryViewerDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StoryViewerListEnvelopeToJson(
  StoryViewerListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
