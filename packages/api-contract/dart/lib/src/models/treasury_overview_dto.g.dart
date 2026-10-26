// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'treasury_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TreasuryOverviewDto _$TreasuryOverviewDtoFromJson(
  Map<String, dynamic> json,
) => TreasuryOverviewDto(
  availableCents: (json['availableCents'] as num?)?.toInt(),
  pendingCents: (json['pendingCents'] as num?)?.toInt(),
  setup: TreasurySetupDto.fromJson(json['setup'] as Map<String, dynamic>),
  profitBank: json['profitBank'] == null
      ? null
      : TreasuryBankDto.fromJson(json['profitBank'] as Map<String, dynamic>),
  expenseBank: json['expenseBank'] == null
      ? null
      : TreasuryBankDto.fromJson(json['expenseBank'] as Map<String, dynamic>),
  plan: TreasuryPlanDto.fromJson(json['plan'] as Map<String, dynamic>),
  expenses: (json['expenses'] as List<dynamic>)
      .map((e) => TreasuryExpenseDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  costLines: (json['costLines'] as List<dynamic>)
      .map((e) => TreasuryCostLineDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  settings: TreasurySettingsDto.fromJson(
    json['settings'] as Map<String, dynamic>,
  ),
  payouts: (json['payouts'] as List<dynamic>)
      .map((e) => TreasuryPayoutDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  nextRunAt: DateTime.parse(json['nextRunAt'] as String),
  ranThisPeriod: json['ranThisPeriod'] as bool,
  payroll: TreasuryPayrollDto.fromJson(json['payroll'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TreasuryOverviewDtoToJson(
  TreasuryOverviewDto instance,
) => <String, dynamic>{
  'availableCents': ?instance.availableCents,
  'pendingCents': ?instance.pendingCents,
  'setup': instance.setup.toJson(),
  'profitBank': ?instance.profitBank?.toJson(),
  'expenseBank': ?instance.expenseBank?.toJson(),
  'plan': instance.plan.toJson(),
  'expenses': instance.expenses.map((e) => e.toJson()).toList(),
  'costLines': instance.costLines.map((e) => e.toJson()).toList(),
  'settings': instance.settings.toJson(),
  'payouts': instance.payouts.map((e) => e.toJson()).toList(),
  'nextRunAt': instance.nextRunAt.toIso8601String(),
  'ranThisPeriod': instance.ranThisPeriod,
  'payroll': instance.payroll.toJson(),
};
