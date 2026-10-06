// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'budget_limit_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BudgetLimitDto _$BudgetLimitDtoFromJson(Map<String, dynamic> json) =>
    BudgetLimitDto(
      provider: BudgetLimitDtoProvider.fromJson(json['provider'] as String),
      window: BudgetLimitDtoWindow.fromJson(json['window'] as String),
      mode: BudgetLimitDtoMode.fromJson(json['mode'] as String),
      floor: (json['floor'] as num).toInt(),
      ceiling: (json['ceiling'] as num).toInt(),
      cap: (json['cap'] as num).toInt(),
      envDefault: (json['envDefault'] as num).toInt(),
      usedToday: (json['usedToday'] as num).toInt(),
      usedThisMonth: (json['usedThisMonth'] as num).toInt(),
      lastAutoAt: json['lastAutoAt'] == null
          ? null
          : DateTime.parse(json['lastAutoAt'] as String),
    );

Map<String, dynamic> _$BudgetLimitDtoToJson(BudgetLimitDto instance) =>
    <String, dynamic>{
      'provider': instance.provider.toJson(),
      'window': instance.window.toJson(),
      'mode': instance.mode.toJson(),
      'floor': instance.floor,
      'ceiling': instance.ceiling,
      'cap': instance.cap,
      'envDefault': instance.envDefault,
      'usedToday': instance.usedToday,
      'usedThisMonth': instance.usedThisMonth,
      'lastAutoAt': ?instance.lastAutoAt?.toIso8601String(),
    };
