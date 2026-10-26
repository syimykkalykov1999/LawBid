// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_stats_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustStatsEnvelope _$TrustStatsEnvelopeFromJson(Map<String, dynamic> json) =>
    TrustStatsEnvelope(
      data: TrustStatsDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$TrustStatsEnvelopeToJson(TrustStatsEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
