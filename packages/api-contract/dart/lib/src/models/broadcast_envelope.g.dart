// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'broadcast_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BroadcastEnvelope _$BroadcastEnvelopeFromJson(Map<String, dynamic> json) =>
    BroadcastEnvelope(
      data: BroadcastDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$BroadcastEnvelopeToJson(BroadcastEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
