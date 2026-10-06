// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_click_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionClickResultEnvelope _$PromotionClickResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => PromotionClickResultEnvelope(
  data: PromotionClickResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PromotionClickResultEnvelopeToJson(
  PromotionClickResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
