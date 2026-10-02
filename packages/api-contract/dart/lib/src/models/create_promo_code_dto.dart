// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promo_applies_to.dart';
import 'promo_audience.dart';
import 'promo_discount_type.dart';

part 'create_promo_code_dto.g.dart';

@JsonSerializable()
class CreatePromoCodeDto {
  const CreatePromoCodeDto({
    required this.code,
    required this.discountType,
    this.audience = PromoAudience.attorney,
    this.appliesTo = PromoAppliesTo.any,
    this.description,
    this.percentOff,
    this.amountOffCents,
    this.freeDays,
    this.maxRedemptions,
    this.startsAt,
    this.expiresAt,
  });

  factory CreatePromoCodeDto.fromJson(Map<String, Object?> json) =>
      _$CreatePromoCodeDtoFromJson(json);

  /// A–Z, 0–9, "-", "_"; 3–40 chars; stored upper-case.
  final String code;
  final String? description;
  final PromoDiscountType discountType;

  /// Required for percent.
  final int? percentOff;

  /// Required for amount (cents, USD).
  final int? amountOffCents;

  /// Required for free_days (added to the trial).
  final int? freeDays;
  final PromoAudience audience;
  final PromoAppliesTo appliesTo;
  final int? maxRedemptions;
  final DateTime? startsAt;
  final DateTime? expiresAt;

  Map<String, Object?> toJson() => _$CreatePromoCodeDtoToJson(this);
}
