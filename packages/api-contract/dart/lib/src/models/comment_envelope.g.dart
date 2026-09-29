// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'comment_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CommentEnvelope _$CommentEnvelopeFromJson(Map<String, dynamic> json) =>
    CommentEnvelope(
      data: CommentDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CommentEnvelopeToJson(CommentEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
