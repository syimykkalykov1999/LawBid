// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelListEnvelope _$ChannelListEnvelopeFromJson(Map<String, dynamic> json) =>
    ChannelListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => ChannelDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ChannelListEnvelopeToJson(
  ChannelListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
