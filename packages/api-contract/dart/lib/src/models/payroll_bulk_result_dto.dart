// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'payroll_bulk_result_dto.g.dart';

@JsonSerializable()
class PayrollBulkResultDto {
  const PayrollBulkResultDto({
    required this.batchId,
    required this.count,
    required this.totals,
    required this.fees,
    required this.net,
    required this.commissions,
    required this.alreadyPaid,
    required this.nothingOwed,
    required this.failed,
  });

  factory PayrollBulkResultDto.fromJson(Map<String, Object?> json) =>
      _$PayrollBulkResultDtoFromJson(json);

  final String batchId;
  final int count;

  /// currency → gross cents of this run.
  final Map<String, int> totals;

  /// currency → Stripe's cost, taken from the payouts.
  final Map<String, int> fees;

  /// currency → what people receive.
  final Map<String, int> net;

  /// currency → commissions and bonuses included.
  final Map<String, int> commissions;

  /// Employees already paid for this period (skipped).
  final List<String> alreadyPaid;

  /// Nothing owed (no salary and no pending commissions).
  final List<String> nothingOwed;

  /// Stripe transfers that failed (not paid; retry later).
  final List<String> failed;

  Map<String, Object?> toJson() => _$PayrollBulkResultDtoToJson(this);
}
