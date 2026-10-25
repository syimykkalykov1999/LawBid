// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'chain_check_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChainCheckEnvelope _$ChainCheckEnvelopeFromJson(Map<String, dynamic> json) =>
    ChainCheckEnvelope(
      data: ChainCheckDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ChainCheckEnvelopeToJson(ChainCheckEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
