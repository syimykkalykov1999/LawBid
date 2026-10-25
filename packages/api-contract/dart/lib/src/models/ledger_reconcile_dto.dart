// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ledger_reconcile_dto_stripe_status.dart';

part 'ledger_reconcile_dto.g.dart';

@JsonSerializable()
class LedgerReconcileDto {
  const LedgerReconcileDto({
    required this.ranAt,
    required this.ok,
    required this.entries,
    required this.unbalancedEntries,
    required this.missingPayments,
    required this.missingCasePayments,
    required this.caseRefundDriftCents,
    required this.stripeStatus,
    required this.stripeDeltaCents,
    required this.problems,
  });

  factory LedgerReconcileDto.fromJson(Map<String, Object?> json) =>
      _$LedgerReconcileDtoFromJson(json);

  final String ranAt;
  final bool ok;
  final int entries;
  final int unbalancedEntries;
  final int missingPayments;
  final int missingCasePayments;
  final int caseRefundDriftCents;
  final LedgerReconcileDtoStripeStatus stripeStatus;
  final int? stripeDeltaCents;
  final List<String> problems;

  Map<String, Object?> toJson() => _$LedgerReconcileDtoToJson(this);
}
