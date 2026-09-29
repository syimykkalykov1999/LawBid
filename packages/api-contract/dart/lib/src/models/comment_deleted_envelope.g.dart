// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'comment_deleted_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CommentDeletedEnvelope _$CommentDeletedEnvelopeFromJson(
  Map<String, dynamic> json,
) => CommentDeletedEnvelope(
  data: CommentDeletedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CommentDeletedEnvelopeToJson(
  CommentDeletedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
