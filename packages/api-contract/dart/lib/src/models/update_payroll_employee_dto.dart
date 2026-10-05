// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_payroll_employee_dto.g.dart';

@JsonSerializable()
class UpdatePayrollEmployeeDto {
  const UpdatePayrollEmployeeDto({
    this.name,
    this.roleTitle,
    this.amountCents,
    this.currency,
    this.methodNote,
    this.email,
    this.active,
  });

  factory UpdatePayrollEmployeeDto.fromJson(Map<String, Object?> json) =>
      _$UpdatePayrollEmployeeDtoFromJson(json);

  final String? name;
  final String? roleTitle;
  final int? amountCents;
  final String? currency;
  final String? methodNote;

  /// For the Stripe invite (bank account / card link).
  final String? email;

  /// Off: taken off payroll (kept in history).
  final bool? active;

  Map<String, Object?> toJson() => _$UpdatePayrollEmployeeDtoToJson(this);
}
