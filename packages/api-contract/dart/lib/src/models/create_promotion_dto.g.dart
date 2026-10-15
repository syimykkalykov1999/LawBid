// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_promotion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePromotionDto _$CreatePromotionDtoFromJson(Map<String, dynamic> json) =>
    CreatePromotionDto(
      days: (json['days'] as num).toInt(),
      useCredits: json['useCredits'] as bool? ?? true,
      dailyBudgetCents: (json['dailyBudgetCents'] as num?)?.toInt(),
      audience: json['audience'] == null
          ? null
          : PromotionAudienceDto.fromJson(
              json['audience'] as Map<String, dynamic>,
            ),
      promoCode: json['promoCode'] as String?,
      goal: json['goal'] == null
          ? null
          : CreatePromotionDtoGoal.fromJson(json['goal'] as String),
      ctaType: json['ctaType'] == null
          ? null
          : CreatePromotionDtoCtaType.fromJson(json['ctaType'] as String),
      ctaValue: json['ctaValue'] as String?,
    );

Map<String, dynamic> _$CreatePromotionDtoToJson(CreatePromotionDto instance) =>
    <String, dynamic>{
      'days': instance.days,
      'dailyBudgetCents': ?instance.dailyBudgetCents,
      'audience': ?instance.audience?.toJson(),
      'useCredits': instance.useCredits,
      'promoCode': ?instance.promoCode,
      'goal': ?instance.goal?.toJson(),
      'ctaType': ?instance.ctaType?.toJson(),
      'ctaValue': ?instance.ctaValue,
    };
