// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'comment_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CommentListEnvelope _$CommentListEnvelopeFromJson(Map<String, dynamic> json) =>
    CommentListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => CommentDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CommentListEnvelopeToJson(
  CommentListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
