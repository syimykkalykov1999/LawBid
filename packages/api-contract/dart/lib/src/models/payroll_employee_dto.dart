// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'payroll_employee_dto.g.dart';

@JsonSerializable()
class PayrollEmployeeDto {
  const PayrollEmployeeDto({
    required this.id,
    required this.name,
    required this.roleTitle,
    required this.amountCents,
    required this.currency,
    required this.methodNote,
    required this.stripeLinked,
    required this.stripePayoutsEnabled,
    required this.active,
    required this.pendingCents,
    required this.createdAt,
    this.adminUserId,
    this.email,
    this.lastPaidPeriod,
    this.userId,
  });

  factory PayrollEmployeeDto.fromJson(Map<String, Object?> json) =>
      _$PayrollEmployeeDtoFromJson(json);

  final String id;
  final String? adminUserId;
  final String name;
  final String roleTitle;
  final int amountCents;
  final String currency;
  final String methodNote;
  final String? email;

  /// A Stripe account was created for them.
  final bool stripeLinked;

  /// Their bank account / card is linked in Stripe.
  final bool stripePayoutsEnabled;
  final bool active;
  final String? lastPaidPeriod;

  /// LawBid account paid through payroll (partner, blogger).
  final String? userId;

  /// Commissions and bonuses waiting for the next payout, cents (their currency).
  final int pendingCents;
  final String createdAt;

  Map<String, Object?> toJson() => _$PayrollEmployeeDtoToJson(this);
}
