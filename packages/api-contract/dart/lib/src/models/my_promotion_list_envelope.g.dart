// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_promotion_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyPromotionListEnvelope _$MyPromotionListEnvelopeFromJson(
  Map<String, dynamic> json,
) => MyPromotionListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => MyPromotionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MyPromotionListEnvelopeToJson(
  MyPromotionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
