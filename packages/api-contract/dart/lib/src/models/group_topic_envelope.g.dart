// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_topic_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupTopicEnvelope _$GroupTopicEnvelopeFromJson(Map<String, dynamic> json) =>
    GroupTopicEnvelope(
      data: GroupTopicDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$GroupTopicEnvelopeToJson(GroupTopicEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
