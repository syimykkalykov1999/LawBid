// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ledger_balance_dto.dart';
import 'ledger_reconcile_dto.dart';

part 'ledger_overview_dto.g.dart';

@JsonSerializable()
class LedgerOverviewDto {
  const LedgerOverviewDto({required this.balances, required this.last});

  factory LedgerOverviewDto.fromJson(Map<String, Object?> json) =>
      _$LedgerOverviewDtoFromJson(json);

  final List<LedgerBalanceDto> balances;

  /// The last nightly reconciliation, null before the first run.
  final LedgerReconcileDto? last;

  Map<String, Object?> toJson() => _$LedgerOverviewDtoToJson(this);
}
