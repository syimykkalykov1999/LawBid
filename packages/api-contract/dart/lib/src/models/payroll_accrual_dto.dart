// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payroll_accrual_dto_kind.dart';
import 'payroll_accrual_dto_status.dart';

part 'payroll_accrual_dto.g.dart';

@JsonSerializable()
class PayrollAccrualDto {
  const PayrollAccrualDto({
    required this.id,
    required this.employeeId,
    required this.source,
    required this.kind,
    required this.eventRef,
    required this.amountCents,
    required this.currency,
    required this.period,
    required this.status,
    required this.createdAt,
    this.note,
    this.payoutId,
  });

  factory PayrollAccrualDto.fromJson(Map<String, Object?> json) =>
      _$PayrollAccrualDtoFromJson(json);

  final String id;
  final String employeeId;
  final String source;
  final PayrollAccrualDtoKind kind;
  final String eventRef;
  final int amountCents;
  final String currency;
  final String period;
  final String? note;
  final PayrollAccrualDtoStatus status;
  final String? payoutId;
  final String createdAt;

  Map<String, Object?> toJson() => _$PayrollAccrualDtoToJson(this);
}
