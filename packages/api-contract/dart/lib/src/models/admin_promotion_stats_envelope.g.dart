// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_promotion_stats_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPromotionStatsEnvelope _$AdminPromotionStatsEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPromotionStatsEnvelope(
  data: AdminPromotionStatsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPromotionStatsEnvelopeToJson(
  AdminPromotionStatsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
