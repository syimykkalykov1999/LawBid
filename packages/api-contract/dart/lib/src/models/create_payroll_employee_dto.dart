// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_payroll_employee_dto.g.dart';

@JsonSerializable()
class CreatePayrollEmployeeDto {
  const CreatePayrollEmployeeDto({
    required this.name,
    required this.amountCents,
    this.currency = 'usd',
    this.roleTitle,
    this.adminUserId,
    this.methodNote,
    this.email,
  });

  factory CreatePayrollEmployeeDto.fromJson(Map<String, Object?> json) =>
      _$CreatePayrollEmployeeDtoFromJson(json);

  final String name;
  final String? roleTitle;

  /// The admin account of this person, if any.
  final String? adminUserId;

  /// Fixed monthly amount, cents (0: paid only by commissions).
  final int amountCents;
  final String currency;

  /// How they are paid (bank, Zelle, cash…).
  final String? methodNote;

  /// For the Stripe invite (bank account / card link).
  final String? email;

  Map<String, Object?> toJson() => _$CreatePayrollEmployeeDtoToJson(this);
}
