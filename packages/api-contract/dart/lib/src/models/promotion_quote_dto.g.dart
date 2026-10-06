// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_quote_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionQuoteDto _$PromotionQuoteDtoFromJson(Map<String, dynamic> json) =>
    PromotionQuoteDto(
      days: (json['days'] as num).toInt(),
      priceCentsPerDay: (json['priceCentsPerDay'] as num).toInt(),
      grossCents: (json['grossCents'] as num).toInt(),
      totalCents: (json['totalCents'] as num).toInt(),
      creditDaysAvailable: (json['creditDaysAvailable'] as num).toInt(),
      creditDaysUsed: (json['creditDaysUsed'] as num).toInt(),
      creditDaysAvailableExact: json['creditDaysAvailableExact'] as num,
      creditDaysUsedExact: json['creditDaysUsedExact'] as num,
      maxDays: (json['maxDays'] as num).toInt(),
      enabled: json['enabled'] as bool,
      dailyBudgetCents: (json['dailyBudgetCents'] as num).toInt(),
      minDailyBudgetCents: (json['minDailyBudgetCents'] as num).toInt(),
      maxDailyBudgetCents: (json['maxDailyBudgetCents'] as num).toInt(),
      budgetPresetsCents: (json['budgetPresetsCents'] as List<dynamic>)
          .map((e) => (e as num).toInt())
          .toList(),
      durationPresets: (json['durationPresets'] as List<dynamic>)
          .map((e) => (e as num).toInt())
          .toList(),
      cpmCents: (json['cpmCents'] as num).toInt(),
      estImpressions: (json['estImpressions'] as num).toInt(),
      estReachMin: (json['estReachMin'] as num).toInt(),
      estReachMax: (json['estReachMax'] as num).toInt(),
      postsEnabled: json['postsEnabled'] as bool,
      casesEnabled: json['casesEnabled'] as bool,
    );

Map<String, dynamic> _$PromotionQuoteDtoToJson(PromotionQuoteDto instance) =>
    <String, dynamic>{
      'days': instance.days,
      'priceCentsPerDay': instance.priceCentsPerDay,
      'grossCents': instance.grossCents,
      'totalCents': instance.totalCents,
      'creditDaysAvailable': instance.creditDaysAvailable,
      'creditDaysUsed': instance.creditDaysUsed,
      'creditDaysAvailableExact': instance.creditDaysAvailableExact,
      'creditDaysUsedExact': instance.creditDaysUsedExact,
      'maxDays': instance.maxDays,
      'enabled': instance.enabled,
      'dailyBudgetCents': instance.dailyBudgetCents,
      'minDailyBudgetCents': instance.minDailyBudgetCents,
      'maxDailyBudgetCents': instance.maxDailyBudgetCents,
      'budgetPresetsCents': instance.budgetPresetsCents,
      'durationPresets': instance.durationPresets,
      'cpmCents': instance.cpmCents,
      'estImpressions': instance.estImpressions,
      'estReachMin': instance.estReachMin,
      'estReachMax': instance.estReachMax,
      'postsEnabled': instance.postsEnabled,
      'casesEnabled': instance.casesEnabled,
    };
