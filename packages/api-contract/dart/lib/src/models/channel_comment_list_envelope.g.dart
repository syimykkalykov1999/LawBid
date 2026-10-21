// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_comment_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelCommentListEnvelope _$ChannelCommentListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ChannelCommentListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ChannelCommentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ChannelCommentListEnvelopeToJson(
  ChannelCommentListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
