// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_promotion_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePromotionResultEnvelope _$CreatePromotionResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => CreatePromotionResultEnvelope(
  data: CreatePromotionResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CreatePromotionResultEnvelopeToJson(
  CreatePromotionResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
