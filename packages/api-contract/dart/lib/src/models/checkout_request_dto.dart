// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'subscription_plan.dart';

part 'checkout_request_dto.g.dart';

@JsonSerializable()
class CheckoutRequestDto {
  const CheckoutRequestDto({
    this.assistantPhones,
    this.promoCode,
    this.plan = SubscriptionPlan.monthly,
    this.assistantSeats = 0,
  });

  factory CheckoutRequestDto.fromJson(Map<String, Object?> json) =>
      _$CheckoutRequestDtoFromJson(json);

  final SubscriptionPlan plan;
  final int assistantSeats;
  final List<String>? assistantPhones;

  /// Owner 2026-10-02: a promo code (case-insensitive). 400 PROMO_CODE_INVALID with details.reason when it cannot be used.
  final String? promoCode;

  Map<String, Object?> toJson() => _$CheckoutRequestDtoToJson(this);
}
