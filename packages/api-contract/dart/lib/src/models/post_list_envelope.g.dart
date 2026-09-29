// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostListEnvelope _$PostListEnvelopeFromJson(Map<String, dynamic> json) =>
    PostListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => PostDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PostListEnvelopeToJson(PostListEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.map((e) => e.toJson()).toList(),
      'meta': ?instance.meta?.toJson(),
    };
