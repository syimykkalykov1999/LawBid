// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionOverviewEnvelope _$PromotionOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => PromotionOverviewEnvelope(
  data: PromotionOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PromotionOverviewEnvelopeToJson(
  PromotionOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
