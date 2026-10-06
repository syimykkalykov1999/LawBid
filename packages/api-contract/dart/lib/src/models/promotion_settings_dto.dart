// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'promotion_settings_dto.g.dart';

@JsonSerializable()
class PromotionSettingsDto {
  const PromotionSettingsDto({
    required this.enabled,
    required this.priceCentsPerDay,
    required this.maxDays,
    required this.postsEnabled,
    required this.cpmCents,
    required this.minDailyBudgetCents,
    required this.maxDailyBudgetCents,
    required this.budgetPresetsCents,
    required this.durationPresets,
    required this.feedEveryN,
    required this.caseFeedSlots,
    required this.frequencyCapPerDay,
    required this.impressionsPerPerson,
    required this.autoApprove,
    required this.requireSubscription,
    this.maxActivePerCase = 1,
  });

  factory PromotionSettingsDto.fromJson(Map<String, Object?> json) =>
      _$PromotionSettingsDtoFromJson(json);

  final bool enabled;
  final int priceCentsPerDay;
  final int maxDays;
  final int maxActivePerCase;
  final bool postsEnabled;

  /// Price of 1 000 impressions.
  final int cpmCents;
  final int minDailyBudgetCents;
  final int maxDailyBudgetCents;
  final List<int> budgetPresetsCents;
  final List<int> durationPresets;
  final int feedEveryN;
  final int caseFeedSlots;
  final int frequencyCapPerDay;
  final num impressionsPerPerson;
  final bool autoApprove;
  final bool requireSubscription;

  Map<String, Object?> toJson() => _$PromotionSettingsDtoToJson(this);
}
