// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'block_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BlockResultEnvelope _$BlockResultEnvelopeFromJson(Map<String, dynamic> json) =>
    BlockResultEnvelope(
      data: BlockResultDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$BlockResultEnvelopeToJson(
  BlockResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
