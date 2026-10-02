// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promo_validation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromoValidationDto _$PromoValidationDtoFromJson(Map<String, dynamic> json) =>
    PromoValidationDto(
      valid: json['valid'] as bool,
      code: json['code'] as String,
      discountType: json['discountType'] == null
          ? null
          : PromoDiscountType.fromJson(json['discountType'] as String),
      percentOff: (json['percentOff'] as num?)?.toInt(),
      amountOffCents: (json['amountOffCents'] as num?)?.toInt(),
      freeDays: (json['freeDays'] as num?)?.toInt(),
      description: json['description'] as String?,
      reason: json['reason'] == null
          ? null
          : PromoRejectReason.fromJson(json['reason'] as String),
    );

Map<String, dynamic> _$PromoValidationDtoToJson(PromoValidationDto instance) =>
    <String, dynamic>{
      'valid': instance.valid,
      'code': instance.code,
      'discountType': ?instance.discountType?.toJson(),
      'percentOff': ?instance.percentOff,
      'amountOffCents': ?instance.amountOffCents,
      'freeDays': ?instance.freeDays,
      'description': ?instance.description,
      'reason': ?instance.reason?.toJson(),
    };
