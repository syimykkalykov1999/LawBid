// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shard_move_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ShardMoveEnvelope _$ShardMoveEnvelopeFromJson(Map<String, dynamic> json) =>
    ShardMoveEnvelope(
      data: ShardMoveDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ShardMoveEnvelopeToJson(ShardMoveEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
