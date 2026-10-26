// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'subscription_plan.dart';

part 'checkout_request_dto.g.dart';

@JsonSerializable()
class CheckoutRequestDto {
  const CheckoutRequestDto({
    this.planCode,
    this.assistantPhones,
    this.promoCode,
    this.plan = SubscriptionPlan.monthly,
    this.assistantSeats = 0,
  });

  factory CheckoutRequestDto.fromJson(Map<String, Object?> json) =>
      _$CheckoutRequestDtoFromJson(json);

  final SubscriptionPlan plan;

  /// Owner 2026-10-05: the plan to buy (code from GET /plans or /subscriptions/me). Default: the audience's default plan of `plan`'s interval.
  final String? planCode;

  /// Extra assistant seats on top of the ones the plan includes.
  final int assistantSeats;
  final List<String>? assistantPhones;

  /// Owner 2026-10-02: a promo code (case-insensitive). 400 PROMO_CODE_INVALID with details.reason when it cannot be used.
  final String? promoCode;

  Map<String, Object?> toJson() => _$CheckoutRequestDtoToJson(this);
}
