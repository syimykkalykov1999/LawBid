// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'billing_totals_dto.dart';
import 'case_billing_dto_role.dart';
import 'expense_dto.dart';
import 'invoice_dto.dart';
import 'running_timer_dto.dart';
import 'time_entry_dto.dart';

part 'case_billing_dto.g.dart';

@JsonSerializable()
class CaseBillingDto {
  const CaseBillingDto({
    required this.role,
    required this.canEdit,
    required this.currency,
    required this.hourlyRateCents,
    required this.timer,
    required this.entries,
    required this.expenses,
    required this.unbilled,
    required this.invoices,
  });

  factory CaseBillingDto.fromJson(Map<String, Object?> json) =>
      _$CaseBillingDtoFromJson(json);

  final CaseBillingDtoRole role;

  /// Attorney side that may add and issue.
  final bool canEdit;
  final String currency;
  final num? hourlyRateCents;
  final RunningTimerDto? timer;

  /// Attorney only.
  final List<TimeEntryDto> entries;

  /// Attorney only.
  final List<ExpenseDto> expenses;

  /// Not yet on an invoice.
  final BillingTotalsDto unbilled;
  final List<InvoiceDto> invoices;

  Map<String, Object?> toJson() => _$CaseBillingDtoToJson(this);
}
