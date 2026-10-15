// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_promotion_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdatePromotionSettingsDto _$UpdatePromotionSettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdatePromotionSettingsDto(
  maxActivePerCase: (json['maxActivePerCase'] as num?)?.toInt() ?? 1,
  enabled: json['enabled'] as bool?,
  priceCentsPerDay: (json['priceCentsPerDay'] as num?)?.toInt(),
  maxDays: (json['maxDays'] as num?)?.toInt(),
  postsEnabled: json['postsEnabled'] as bool?,
  cpmCents: (json['cpmCents'] as num?)?.toInt(),
  minDailyBudgetCents: (json['minDailyBudgetCents'] as num?)?.toInt(),
  maxDailyBudgetCents: (json['maxDailyBudgetCents'] as num?)?.toInt(),
  budgetPresetsCents: (json['budgetPresetsCents'] as List<dynamic>?)
      ?.map((e) => (e as num).toInt())
      .toList(),
  durationPresets: (json['durationPresets'] as List<dynamic>?)
      ?.map((e) => (e as num).toInt())
      .toList(),
  reelEveryN: (json['reelEveryN'] as num?)?.toInt(),
  reelsEnabled: json['reelsEnabled'] as bool?,
  boostEnabled: json['boostEnabled'] as bool?,
  attorneysEnabled: json['attorneysEnabled'] as bool?,
  clientsEnabled: json['clientsEnabled'] as bool?,
  ctaEnabled: json['ctaEnabled'] as bool?,
  ctaTypes: (json['ctaTypes'] as List<dynamic>?)
      ?.map((e) => UpdatePromotionSettingsDtoCtaTypes.fromJson(e as String))
      .toList(),
  caseFeedSlots: (json['caseFeedSlots'] as num?)?.toInt(),
  frequencyCapPerDay: (json['frequencyCapPerDay'] as num?)?.toInt(),
  impressionsPerPerson: json['impressionsPerPerson'] as num?,
  autoApprove: json['autoApprove'] as bool?,
  requireSubscription: json['requireSubscription'] as bool?,
  feedEveryN: (json['feedEveryN'] as num?)?.toInt(),
);

Map<String, dynamic> _$UpdatePromotionSettingsDtoToJson(
  UpdatePromotionSettingsDto instance,
) => <String, dynamic>{
  'enabled': ?instance.enabled,
  'priceCentsPerDay': ?instance.priceCentsPerDay,
  'maxDays': ?instance.maxDays,
  'maxActivePerCase': instance.maxActivePerCase,
  'postsEnabled': ?instance.postsEnabled,
  'cpmCents': ?instance.cpmCents,
  'minDailyBudgetCents': ?instance.minDailyBudgetCents,
  'maxDailyBudgetCents': ?instance.maxDailyBudgetCents,
  'budgetPresetsCents': ?instance.budgetPresetsCents,
  'durationPresets': ?instance.durationPresets,
  'reelEveryN': ?instance.reelEveryN,
  'reelsEnabled': ?instance.reelsEnabled,
  'boostEnabled': ?instance.boostEnabled,
  'attorneysEnabled': ?instance.attorneysEnabled,
  'clientsEnabled': ?instance.clientsEnabled,
  'ctaEnabled': ?instance.ctaEnabled,
  'ctaTypes': ?instance.ctaTypes?.map((e) => e.toJson()).toList(),
  'caseFeedSlots': ?instance.caseFeedSlots,
  'frequencyCapPerDay': ?instance.frequencyCapPerDay,
  'impressionsPerPerson': ?instance.impressionsPerPerson,
  'autoApprove': ?instance.autoApprove,
  'requireSubscription': ?instance.requireSubscription,
  'feedEveryN': ?instance.feedEveryN,
};
