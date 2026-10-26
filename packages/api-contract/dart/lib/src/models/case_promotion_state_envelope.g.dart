// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_promotion_state_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePromotionStateEnvelope _$CasePromotionStateEnvelopeFromJson(
  Map<String, dynamic> json,
) => CasePromotionStateEnvelope(
  data: CasePromotionStateDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CasePromotionStateEnvelopeToJson(
  CasePromotionStateEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
