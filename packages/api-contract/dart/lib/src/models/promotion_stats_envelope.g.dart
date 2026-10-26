// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_stats_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionStatsEnvelope _$PromotionStatsEnvelopeFromJson(
  Map<String, dynamic> json,
) => PromotionStatsEnvelope(
  data: PromotionStatsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PromotionStatsEnvelopeToJson(
  PromotionStatsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
