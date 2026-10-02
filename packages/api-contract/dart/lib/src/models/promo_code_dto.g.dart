// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promo_code_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromoCodeDto _$PromoCodeDtoFromJson(Map<String, dynamic> json) => PromoCodeDto(
  id: json['id'] as String,
  code: json['code'] as String,
  description: json['description'] as String?,
  discountType: PromoDiscountType.fromJson(json['discountType'] as String),
  percentOff: (json['percentOff'] as num?)?.toInt(),
  amountOffCents: (json['amountOffCents'] as num?)?.toInt(),
  freeDays: (json['freeDays'] as num?)?.toInt(),
  audience: PromoAudience.fromJson(json['audience'] as String),
  appliesTo: PromoAppliesTo.fromJson(json['appliesTo'] as String),
  maxRedemptions: (json['maxRedemptions'] as num?)?.toInt(),
  redeemedCount: (json['redeemedCount'] as num).toInt(),
  startsAt: json['startsAt'] == null
      ? null
      : DateTime.parse(json['startsAt'] as String),
  expiresAt: json['expiresAt'] == null
      ? null
      : DateTime.parse(json['expiresAt'] as String),
  active: json['active'] as bool,
  status: PromoCodeStatus.fromJson(json['status'] as String),
  stripeCouponId: json['stripeCouponId'] as String?,
  createdBy: json['createdBy'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$PromoCodeDtoToJson(PromoCodeDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'code': instance.code,
      'description': ?instance.description,
      'discountType': instance.discountType.toJson(),
      'percentOff': ?instance.percentOff,
      'amountOffCents': ?instance.amountOffCents,
      'freeDays': ?instance.freeDays,
      'audience': instance.audience.toJson(),
      'appliesTo': instance.appliesTo.toJson(),
      'maxRedemptions': ?instance.maxRedemptions,
      'redeemedCount': instance.redeemedCount,
      'startsAt': ?instance.startsAt?.toIso8601String(),
      'expiresAt': ?instance.expiresAt?.toIso8601String(),
      'active': instance.active,
      'status': instance.status.toJson(),
      'stripeCouponId': ?instance.stripeCouponId,
      'createdBy': instance.createdBy,
      'createdAt': instance.createdAt.toIso8601String(),
    };
