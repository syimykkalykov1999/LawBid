// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_promotion_cta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostPromotionCtaDto _$PostPromotionCtaDtoFromJson(Map<String, dynamic> json) =>
    PostPromotionCtaDto(
      type: PostPromotionCtaDtoType.fromJson(json['type'] as String),
      value: json['value'] as String?,
    );

Map<String, dynamic> _$PostPromotionCtaDtoToJson(
  PostPromotionCtaDto instance,
) => <String, dynamic>{
  'type': instance.type.toJson(),
  'value': ?instance.value,
};
