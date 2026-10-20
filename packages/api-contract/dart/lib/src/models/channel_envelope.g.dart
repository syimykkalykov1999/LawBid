// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelEnvelope _$ChannelEnvelopeFromJson(Map<String, dynamic> json) =>
    ChannelEnvelope(
      data: ChannelDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ChannelEnvelopeToJson(ChannelEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
