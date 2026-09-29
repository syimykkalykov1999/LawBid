// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostEnvelope _$PostEnvelopeFromJson(Map<String, dynamic> json) => PostEnvelope(
  data: PostDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PostEnvelopeToJson(PostEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
