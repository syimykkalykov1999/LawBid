// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'treasury_expense_dto_source.dart';

part 'treasury_expense_dto.g.dart';

@JsonSerializable()
class TreasuryExpenseDto {
  const TreasuryExpenseDto({
    required this.id,
    required this.name,
    required this.monthlyCents,
    required this.effectiveCents,
    required this.source,
    required this.active,
    required this.sort,
  });

  factory TreasuryExpenseDto.fromJson(Map<String, Object?> json) =>
      _$TreasuryExpenseDtoFromJson(json);

  final String id;
  final String name;

  /// What the owner entered.
  final int monthlyCents;

  /// What the split counts: for AWS the higher of the entry and this month's AWS forecast.
  final int effectiveCents;
  final TreasuryExpenseDtoSource source;
  final bool active;
  final int sort;

  Map<String, Object?> toJson() => _$TreasuryExpenseDtoToJson(this);
}
