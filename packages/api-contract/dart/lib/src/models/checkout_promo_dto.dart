// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promo_discount_type.dart';

part 'checkout_promo_dto.g.dart';

@JsonSerializable()
class CheckoutPromoDto {
  const CheckoutPromoDto({
    required this.code,
    required this.discountType,
    required this.discountCents,
    required this.freeDays,
  });

  factory CheckoutPromoDto.fromJson(Map<String, Object?> json) =>
      _$CheckoutPromoDtoFromJson(json);

  final String code;
  final PromoDiscountType discountType;

  /// Off the first invoice (percent / amount codes).
  final int? discountCents;

  /// Free days added to the trial (free_days codes).
  final int? freeDays;

  Map<String, Object?> toJson() => _$CheckoutPromoDtoToJson(this);
}
