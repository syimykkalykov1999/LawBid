// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_post_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelPostEnvelope _$ChannelPostEnvelopeFromJson(Map<String, dynamic> json) =>
    ChannelPostEnvelope(
      data: ChannelPostDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ChannelPostEnvelopeToJson(
  ChannelPostEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
