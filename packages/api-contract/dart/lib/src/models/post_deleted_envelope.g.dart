// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_deleted_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostDeletedEnvelope _$PostDeletedEnvelopeFromJson(Map<String, dynamic> json) =>
    PostDeletedEnvelope(
      data: PostDeletedDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PostDeletedEnvelopeToJson(
  PostDeletedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
