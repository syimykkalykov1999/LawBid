// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_post_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelPostListEnvelope _$ChannelPostListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ChannelPostListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ChannelPostDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ChannelPostListEnvelopeToJson(
  ChannelPostListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
