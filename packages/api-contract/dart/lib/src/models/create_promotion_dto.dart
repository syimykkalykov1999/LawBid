// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'boost_billing.dart';
import 'create_promotion_dto_cta_type.dart';
import 'create_promotion_dto_goal.dart';
import 'create_promotion_dto_pay_with.dart';
import 'promotion_audience_dto.dart';

part 'create_promotion_dto.g.dart';

@JsonSerializable()
class CreatePromotionDto {
  const CreatePromotionDto({
    required this.days,
    this.useCredits = true,
    this.payWith,
    this.dailyBudgetCents,
    this.audience,
    this.promoCode,
    this.extend,
    this.goal,
    this.ctaType,
    this.ctaValue,
    this.billing,
  });

  factory CreatePromotionDto.fromJson(Map<String, Object?> json) =>
      _$CreatePromotionDtoFromJson(json);

  /// How to pay: the web card checkout (default) or the star balance.
  final CreatePromotionDtoPayWith? payWith;
  final int days;

  /// Owner 2026-10-05: daily budget; default from the admin.
  final int? dailyBudgetCents;
  final PromotionAudienceDto? audience;

  /// Spend free days earned through referrals first.
  final bool useCredits;
  final String? promoCode;

  /// Owner 2026-10-15: extend a running boost — the new days start when it ends.
  final bool? extend;
  final CreatePromotionDtoGoal? goal;

  /// The button under a promoted post (posts only).
  final CreatePromotionDtoCtaType? ctaType;

  /// https link (more, download) or a phone (call).
  final String? ctaValue;

  /// Owner 2026-10-27: what to pay for (views, people, taps, real actions); default = the first one the owner switched on.
  final BoostBilling? billing;

  Map<String, Object?> toJson() => _$CreatePromotionDtoToJson(this);
}
