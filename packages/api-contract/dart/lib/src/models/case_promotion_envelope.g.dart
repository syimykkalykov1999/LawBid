// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_promotion_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePromotionEnvelope _$CasePromotionEnvelopeFromJson(
  Map<String, dynamic> json,
) => CasePromotionEnvelope(
  data: CasePromotionDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CasePromotionEnvelopeToJson(
  CasePromotionEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
