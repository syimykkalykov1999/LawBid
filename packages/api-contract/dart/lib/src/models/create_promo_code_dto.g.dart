// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_promo_code_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreatePromoCodeDto _$CreatePromoCodeDtoFromJson(Map<String, dynamic> json) =>
    CreatePromoCodeDto(
      code: json['code'] as String,
      discountType: PromoDiscountType.fromJson(json['discountType'] as String),
      audience: json['audience'] == null
          ? PromoAudience.attorney
          : PromoAudience.fromJson(json['audience'] as String),
      appliesTo: json['appliesTo'] == null
          ? PromoAppliesTo.any
          : PromoAppliesTo.fromJson(json['appliesTo'] as String),
      description: json['description'] as String?,
      percentOff: (json['percentOff'] as num?)?.toInt(),
      amountOffCents: (json['amountOffCents'] as num?)?.toInt(),
      freeDays: (json['freeDays'] as num?)?.toInt(),
      maxRedemptions: (json['maxRedemptions'] as num?)?.toInt(),
      startsAt: json['startsAt'] == null
          ? null
          : DateTime.parse(json['startsAt'] as String),
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$CreatePromoCodeDtoToJson(CreatePromoCodeDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'description': ?instance.description,
      'discountType': instance.discountType.toJson(),
      'percentOff': ?instance.percentOff,
      'amountOffCents': ?instance.amountOffCents,
      'freeDays': ?instance.freeDays,
      'audience': instance.audience.toJson(),
      'appliesTo': instance.appliesTo.toJson(),
      'maxRedemptions': ?instance.maxRedemptions,
      'startsAt': ?instance.startsAt?.toIso8601String(),
      'expiresAt': ?instance.expiresAt?.toIso8601String(),
    };
