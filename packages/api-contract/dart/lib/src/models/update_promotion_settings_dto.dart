// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'pricing_matrix_dto.dart';
import 'update_promotion_settings_dto_cta_types.dart';

part 'update_promotion_settings_dto.g.dart';

@JsonSerializable()
class UpdatePromotionSettingsDto {
  const UpdatePromotionSettingsDto({
    this.maxActivePerCase = 1,
    this.enabled,
    this.priceCentsPerDay,
    this.maxDays,
    this.postsEnabled,
    this.cpmCents,
    this.minDailyBudgetCents,
    this.maxDailyBudgetCents,
    this.budgetPresetsCents,
    this.durationPresets,
    this.reelEveryN,
    this.reelsEnabled,
    this.boostEnabled,
    this.attorneysEnabled,
    this.clientsEnabled,
    this.ctaEnabled,
    this.ctaTypes,
    this.caseFeedSlots,
    this.frequencyCapPerDay,
    this.impressionsPerPerson,
    this.autoApprove,
    this.requireSubscription,
    this.pricing,
    this.feedEveryN,
  });

  factory UpdatePromotionSettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdatePromotionSettingsDtoFromJson(json);

  final bool? enabled;
  final int? priceCentsPerDay;
  final int? maxDays;
  final int maxActivePerCase;
  final bool? postsEnabled;

  /// Price of 1 000 impressions.
  final int? cpmCents;
  final int? minDailyBudgetCents;
  final int? maxDailyBudgetCents;
  final List<int>? budgetPresetsCents;
  final List<int>? durationPresets;
  final int? reelEveryN;
  final bool? reelsEnabled;
  final bool? boostEnabled;
  final bool? attorneysEnabled;
  final bool? clientsEnabled;
  final bool? ctaEnabled;
  final List<UpdatePromotionSettingsDtoCtaTypes>? ctaTypes;
  final int? caseFeedSlots;
  final int? frequencyCapPerDay;
  final num? impressionsPerPerson;
  final bool? autoApprove;
  final bool? requireSubscription;

  /// Owner 2026-10-27: prices and switches per way to pay (views, people, taps, real actions) for posts, videos, cases and attorney profiles.
  final PricingMatrixDto? pricing;
  final int? feedEveryN;

  Map<String, Object?> toJson() => _$UpdatePromotionSettingsDtoToJson(this);
}
