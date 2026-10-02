// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_promotion_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePromotionResultDto _$CreatePromotionResultDtoFromJson(
  Map<String, dynamic> json,
) => CreatePromotionResultDto(
  promotionId: json['promotionId'] as String,
  status: CasePromotionStatus.fromJson(json['status'] as String),
  totalCents: (json['totalCents'] as num).toInt(),
  creditDaysUsed: (json['creditDaysUsed'] as num).toInt(),
  promotion: CasePromotionDto.fromJson(
    json['promotion'] as Map<String, dynamic>,
  ),
  checkoutUrl: json['checkoutUrl'] as String?,
);

Map<String, dynamic> _$CreatePromotionResultDtoToJson(
  CreatePromotionResultDto instance,
) => <String, dynamic>{
  'promotionId': instance.promotionId,
  'status': instance.status.toJson(),
  'checkoutUrl': ?instance.checkoutUrl,
  'totalCents': instance.totalCents,
  'creditDaysUsed': instance.creditDaysUsed,
  'promotion': instance.promotion.toJson(),
};
