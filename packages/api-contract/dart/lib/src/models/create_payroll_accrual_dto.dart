// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_payroll_accrual_dto_kind.dart';

part 'create_payroll_accrual_dto.g.dart';

@JsonSerializable()
class CreatePayrollAccrualDto {
  const CreatePayrollAccrualDto({
    required this.kind,
    required this.amountCents,
    required this.period,
    required this.note,
  });

  factory CreatePayrollAccrualDto.fromJson(Map<String, Object?> json) =>
      _$CreatePayrollAccrualDtoFromJson(json);

  final CreatePayrollAccrualDtoKind kind;

  /// Cents; negative takes money back.
  final int amountCents;
  final String period;
  final String note;

  Map<String, Object?> toJson() => _$CreatePayrollAccrualDtoToJson(this);
}
