// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'boost_billing.dart';
import 'boost_offer_dto.dart';

part 'promotion_quote_dto.g.dart';

@JsonSerializable()
class PromotionQuoteDto {
  const PromotionQuoteDto({
    required this.days,
    required this.priceCentsPerDay,
    required this.grossCents,
    required this.totalCents,
    required this.starsTotal,
    required this.creditDaysAvailable,
    required this.creditDaysUsed,
    required this.creditDaysAvailableExact,
    required this.creditDaysUsedExact,
    required this.maxDays,
    required this.enabled,
    required this.dailyBudgetCents,
    required this.minDailyBudgetCents,
    required this.maxDailyBudgetCents,
    required this.budgetPresetsCents,
    required this.durationPresets,
    required this.cpmCents,
    required this.estImpressions,
    required this.estReachMin,
    required this.estReachMax,
    required this.postsEnabled,
    required this.casesEnabled,
    required this.ctaTypes,
    required this.billing,
    required this.unitPriceCents,
    required this.estUnits,
    required this.offers,
    required this.actions,
  });

  factory PromotionQuoteDto.fromJson(Map<String, Object?> json) =>
      _$PromotionQuoteDtoFromJson(json);

  final int days;
  final int priceCentsPerDay;

  /// days × price per day.
  final int grossCents;

  /// If credits are used.
  final int totalCents;

  /// The same total in stars; null while stars are switched off or nothing is due.
  final int? starsTotal;

  /// Whole credit days.
  final int creditDaysAvailable;

  /// Whole credit days.
  final int creditDaysUsed;

  /// Referral credit days, exact (owner 2026-10-05: may be fractional, 0.5 = 12 hours).
  final num creditDaysAvailableExact;

  /// Credit days used, exact.
  final num creditDaysUsedExact;
  final int maxDays;

  /// This target can be promoted (admin switch).
  final bool enabled;
  final int dailyBudgetCents;
  final int minDailyBudgetCents;
  final int maxDailyBudgetCents;
  final List<int> budgetPresetsCents;
  final List<int> durationPresets;

  /// Price of 1 000 impressions.
  final int cpmCents;
  final int estImpressions;
  final int estReachMin;
  final int estReachMax;
  final bool postsEnabled;
  final bool casesEnabled;

  /// Owner 2026-10-15: the buttons an advertiser may pick (empty = none).
  final List<String> ctaTypes;
  final BoostBilling billing;

  /// Per 1000 for impressions / reach, per one otherwise.
  final int unitPriceCents;

  /// Units this budget buys in the chosen way to pay.
  final int estUnits;

  /// The ways to pay that are switched on.
  final List<BoostOfferDto> offers;

  /// What counts as a real action (when paid per action).
  final List<String> actions;

  Map<String, Object?> toJson() => _$PromotionQuoteDtoToJson(this);
}
