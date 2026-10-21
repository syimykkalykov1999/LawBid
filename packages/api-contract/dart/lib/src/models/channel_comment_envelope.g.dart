// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_comment_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelCommentEnvelope _$ChannelCommentEnvelopeFromJson(
  Map<String, dynamic> json,
) => ChannelCommentEnvelope(
  data: ChannelCommentDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ChannelCommentEnvelopeToJson(
  ChannelCommentEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
