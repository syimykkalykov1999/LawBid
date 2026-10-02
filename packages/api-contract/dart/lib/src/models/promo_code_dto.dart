// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promo_applies_to.dart';
import 'promo_audience.dart';
import 'promo_code_status.dart';
import 'promo_discount_type.dart';

part 'promo_code_dto.g.dart';

@JsonSerializable()
class PromoCodeDto {
  const PromoCodeDto({
    required this.id,
    required this.code,
    required this.description,
    required this.discountType,
    required this.percentOff,
    required this.amountOffCents,
    required this.freeDays,
    required this.audience,
    required this.appliesTo,
    required this.maxRedemptions,
    required this.redeemedCount,
    required this.startsAt,
    required this.expiresAt,
    required this.active,
    required this.status,
    required this.stripeCouponId,
    required this.createdBy,
    required this.createdAt,
  });

  factory PromoCodeDto.fromJson(Map<String, Object?> json) =>
      _$PromoCodeDtoFromJson(json);

  final String id;
  final String code;
  final String? description;
  final PromoDiscountType discountType;
  final int? percentOff;
  final int? amountOffCents;
  final int? freeDays;
  final PromoAudience audience;
  final PromoAppliesTo appliesTo;
  final int? maxRedemptions;
  final int redeemedCount;
  final DateTime? startsAt;
  final DateTime? expiresAt;
  final bool active;
  final PromoCodeStatus status;
  final String? stripeCouponId;
  final String createdBy;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$PromoCodeDtoToJson(this);
}
