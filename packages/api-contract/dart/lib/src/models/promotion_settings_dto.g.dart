// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionSettingsDto _$PromotionSettingsDtoFromJson(
  Map<String, dynamic> json,
) => PromotionSettingsDto(
  enabled: json['enabled'] as bool,
  priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
  maxDays: (json['maxDays'] as num).toInt(),
  postsEnabled: json['postsEnabled'] as bool,
  cpmCents: (json['cpmCents'] as num).toInt(),
  minDailyBudgetCents: (json['minDailyBudgetCents'] as num).toInt(),
  maxDailyBudgetCents: (json['maxDailyBudgetCents'] as num).toInt(),
  budgetPresetsCents: (json['budgetPresetsCents'] as List<dynamic>)
      .map((e) => (e as num).toInt())
      .toList(),
  durationPresets: (json['durationPresets'] as List<dynamic>)
      .map((e) => (e as num).toInt())
      .toList(),
  feedEveryN: (json['feedEveryN'] as num).toInt(),
  caseFeedSlots: (json['caseFeedSlots'] as num).toInt(),
  frequencyCapPerDay: (json['frequencyCapPerDay'] as num).toInt(),
  impressionsPerPerson: json['impressionsPerPerson'] as num,
  autoApprove: json['autoApprove'] as bool,
  requireSubscription: json['requireSubscription'] as bool,
  maxActivePerCase: (json['maxActivePerCase'] as num?)?.toInt() ?? 1,
);

Map<String, dynamic> _$PromotionSettingsDtoToJson(
  PromotionSettingsDto instance,
) => <String, dynamic>{
  'enabled': instance.enabled,
  'priceCentsPerDay': instance.priceCentsPerDay,
  'maxDays': instance.maxDays,
  'maxActivePerCase': instance.maxActivePerCase,
  'postsEnabled': instance.postsEnabled,
  'cpmCents': instance.cpmCents,
  'minDailyBudgetCents': instance.minDailyBudgetCents,
  'maxDailyBudgetCents': instance.maxDailyBudgetCents,
  'budgetPresetsCents': instance.budgetPresetsCents,
  'durationPresets': instance.durationPresets,
  'feedEveryN': instance.feedEveryN,
  'caseFeedSlots': instance.caseFeedSlots,
  'frequencyCapPerDay': instance.frequencyCapPerDay,
  'impressionsPerPerson': instance.impressionsPerPerson,
  'autoApprove': instance.autoApprove,
  'requireSubscription': instance.requireSubscription,
};
