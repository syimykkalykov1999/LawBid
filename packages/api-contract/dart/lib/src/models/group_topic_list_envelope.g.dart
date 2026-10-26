// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_topic_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupTopicListEnvelope _$GroupTopicListEnvelopeFromJson(
  Map<String, dynamic> json,
) => GroupTopicListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => GroupTopicDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$GroupTopicListEnvelopeToJson(
  GroupTopicListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
