// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'treasury_payroll_dto.g.dart';

@JsonSerializable()
class TreasuryPayrollDto {
  const TreasuryPayrollDto({
    required this.stripeReady,
    required this.nextPayAt,
    required this.paidThisPeriod,
    required this.dueCents,
    required this.people,
    required this.notLinked,
    required this.shortCents,
  });

  factory TreasuryPayrollDto.fromJson(Map<String, Object?> json) =>
      _$TreasuryPayrollDtoFromJson(json);

  /// Flag payroll_stripe_payouts on and Stripe keys saved.
  final bool stripeReady;
  final DateTime nextPayAt;

  /// This month's pay day already ran.
  final bool paidThisPeriod;

  /// What the next pay day takes from Stripe, cents.
  final int dueCents;

  /// People paid automatically.
  final int people;

  /// People on a salary not linked to Stripe (paid by hand).
  final List<String> notLinked;

  /// Missing on Stripe for the next pay day, cents (0: enough).
  final int shortCents;

  Map<String, Object?> toJson() => _$TreasuryPayrollDtoToJson(this);
}
