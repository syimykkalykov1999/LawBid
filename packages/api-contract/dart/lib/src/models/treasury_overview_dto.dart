// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'treasury_bank_dto.dart';
import 'treasury_cost_line_dto.dart';
import 'treasury_expense_dto.dart';
import 'treasury_payout_dto.dart';
import 'treasury_payroll_dto.dart';
import 'treasury_plan_dto.dart';
import 'treasury_settings_dto.dart';
import 'treasury_setup_dto.dart';

part 'treasury_overview_dto.g.dart';

@JsonSerializable()
class TreasuryOverviewDto {
  const TreasuryOverviewDto({
    required this.availableCents,
    required this.pendingCents,
    required this.setup,
    required this.profitBank,
    required this.expenseBank,
    required this.plan,
    required this.expenses,
    required this.costLines,
    required this.settings,
    required this.payouts,
    required this.nextRunAt,
    required this.ranThisPeriod,
    required this.payroll,
  });

  factory TreasuryOverviewDto.fromJson(Map<String, Object?> json) =>
      _$TreasuryOverviewDtoFromJson(json);

  /// Stripe balance available for payout (null: no Stripe).
  final int? availableCents;
  final int? pendingCents;
  final TreasurySetupDto setup;
  final TreasuryBankDto? profitBank;
  final TreasuryBankDto? expenseBank;
  final TreasuryPlanDto plan;
  final List<TreasuryExpenseDto> expenses;
  final List<TreasuryCostLineDto> costLines;
  final TreasurySettingsDto settings;
  final List<TreasuryPayoutDto> payouts;
  final DateTime nextRunAt;

  /// This month's split already ran.
  final bool ranThisPeriod;
  final TreasuryPayrollDto payroll;

  Map<String, Object?> toJson() => _$TreasuryOverviewDtoToJson(this);
}
