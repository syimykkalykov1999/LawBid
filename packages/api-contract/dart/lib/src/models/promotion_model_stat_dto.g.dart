// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_model_stat_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionModelStatDto _$PromotionModelStatDtoFromJson(
  Map<String, dynamic> json,
) => PromotionModelStatDto(
  billing: BoostBilling.fromJson(json['billing'] as String),
  count: (json['count'] as num).toInt(),
  soldCents: (json['soldCents'] as num).toInt(),
  refundedCents: (json['refundedCents'] as num).toInt(),
  delivered: (json['delivered'] as num).toInt(),
);

Map<String, dynamic> _$PromotionModelStatDtoToJson(
  PromotionModelStatDto instance,
) => <String, dynamic>{
  'billing': instance.billing.toJson(),
  'count': instance.count,
  'soldCents': instance.soldCents,
  'refundedCents': instance.refundedCents,
  'delivered': instance.delivered,
};
