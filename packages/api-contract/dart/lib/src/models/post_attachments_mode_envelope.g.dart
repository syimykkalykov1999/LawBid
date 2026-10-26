// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_attachments_mode_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostAttachmentsModeEnvelope _$PostAttachmentsModeEnvelopeFromJson(
  Map<String, dynamic> json,
) => PostAttachmentsModeEnvelope(
  data: PostAttachmentsModeDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PostAttachmentsModeEnvelopeToJson(
  PostAttachmentsModeEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
