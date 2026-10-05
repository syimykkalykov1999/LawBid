// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'payroll_bulk_pay_dto_method.dart';

part 'payroll_bulk_pay_dto.g.dart';

@JsonSerializable()
class PayrollBulkPayDto {
  const PayrollBulkPayDto({
    required this.employeeIds,
    required this.period,
    this.amounts,
    this.note,
    this.method = PayrollBulkPayDtoMethod.manual,
  });

  factory PayrollBulkPayDto.fromJson(Map<String, Object?> json) =>
      _$PayrollBulkPayDtoFromJson(json);

  final List<String> employeeIds;

  /// Month or any period label.
  final String period;
  final PayrollBulkPayDtoMethod method;

  /// employeeId → amount in cents for this run (bonus, part of a month); the others get their fixed amount.
  final Map<String, int>? amounts;
  final String? note;

  Map<String, Object?> toJson() => _$PayrollBulkPayDtoToJson(this);
}
