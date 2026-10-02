// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'checkout_promo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CheckoutPromoDto _$CheckoutPromoDtoFromJson(Map<String, dynamic> json) =>
    CheckoutPromoDto(
      code: json['code'] as String,
      discountType: PromoDiscountType.fromJson(json['discountType'] as String),
      discountCents: (json['discountCents'] as num?)?.toInt(),
      freeDays: (json['freeDays'] as num?)?.toInt(),
    );

Map<String, dynamic> _$CheckoutPromoDtoToJson(CheckoutPromoDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'discountType': instance.discountType.toJson(),
      'discountCents': ?instance.discountCents,
      'freeDays': ?instance.freeDays,
    };
