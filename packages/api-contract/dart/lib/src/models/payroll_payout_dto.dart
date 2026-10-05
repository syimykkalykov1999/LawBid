// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payroll_payout_dto_method.dart';
import 'payroll_payout_dto_status.dart';

part 'payroll_payout_dto.g.dart';

@JsonSerializable()
class PayrollPayoutDto {
  const PayrollPayoutDto({
    required this.id,
    required this.employeeId,
    required this.employeeName,
    required this.batchId,
    required this.period,
    required this.amountCents,
    required this.baseCents,
    required this.commissionCents,
    required this.feeCents,
    required this.netCents,
    required this.currency,
    required this.method,
    required this.status,
    required this.createdAt,
    this.note,
    this.transferId,
    this.failure,
    this.cancelReason,
  });

  factory PayrollPayoutDto.fromJson(Map<String, Object?> json) =>
      _$PayrollPayoutDtoFromJson(json);

  final String id;
  final String employeeId;
  final String employeeName;
  final String batchId;
  final String period;

  /// Gross: salary + commissions.
  final int amountCents;
  final int baseCents;
  final int commissionCents;

  /// Stripe's cost, taken from the person's payout.
  final int feeCents;

  /// What the person receives.
  final int netCents;
  final String currency;
  final PayrollPayoutDtoMethod method;
  final PayrollPayoutDtoStatus status;
  final String? note;
  final String? transferId;
  final String? failure;
  final String? cancelReason;
  final String createdAt;

  Map<String, Object?> toJson() => _$PayrollPayoutDtoToJson(this);
}
