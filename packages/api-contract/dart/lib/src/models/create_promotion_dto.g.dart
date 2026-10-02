// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_promotion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePromotionDto _$CreatePromotionDtoFromJson(Map<String, dynamic> json) =>
    CreatePromotionDto(
      days: (json['days'] as num).toInt(),
      promoCode: json['promoCode'] as String?,
      useCredits: json['useCredits'] as bool? ?? true,
    );

Map<String, dynamic> _$CreatePromotionDtoToJson(CreatePromotionDto instance) =>
    <String, dynamic>{
      'days': instance.days,
      'useCredits': instance.useCredits,
      'promoCode': ?instance.promoCode,
    };
