// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shard_action_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ShardActionEnvelope _$ShardActionEnvelopeFromJson(Map<String, dynamic> json) =>
    ShardActionEnvelope(
      data: ShardActionDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ShardActionEnvelopeToJson(
  ShardActionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
