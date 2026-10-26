// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_quote_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionQuoteEnvelope _$PromotionQuoteEnvelopeFromJson(
  Map<String, dynamic> json,
) => PromotionQuoteEnvelope(
  data: PromotionQuoteDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PromotionQuoteEnvelopeToJson(
  PromotionQuoteEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
