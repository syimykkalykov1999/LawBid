// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_attachments_allowed_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostAttachmentsAllowedEnvelope _$PostAttachmentsAllowedEnvelopeFromJson(
  Map<String, dynamic> json,
) => PostAttachmentsAllowedEnvelope(
  data: PostAttachmentsAllowedDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PostAttachmentsAllowedEnvelopeToJson(
  PostAttachmentsAllowedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
