// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payroll_fee_settings_dto.dart';

part 'payroll_summary_dto.g.dart';

@JsonSerializable()
class PayrollSummaryDto {
  const PayrollSummaryDto({
    required this.period,
    required this.activeEmployees,
    required this.monthly,
    required this.paid,
    required this.unpaidEmployees,
    required this.stripeAvailable,
    required this.pending,
    required this.stripeFees,
  });

  factory PayrollSummaryDto.fromJson(Map<String, Object?> json) =>
      _$PayrollSummaryDtoFromJson(json);

  final String period;
  final int activeEmployees;

  /// currency → fixed monthly total of active employees.
  final Map<String, int> monthly;

  /// currency → paid for this period.
  final Map<String, int> paid;
  final int unpaidEmployees;

  /// Stripe payouts can be used (flag payroll_stripe_payouts on and Stripe keys saved).
  final bool stripeAvailable;

  /// currency → commissions and bonuses waiting for a payout.
  final Map<String, int> pending;
  final PayrollFeeSettingsDto stripeFees;

  Map<String, Object?> toJson() => _$PayrollSummaryDtoToJson(this);
}
