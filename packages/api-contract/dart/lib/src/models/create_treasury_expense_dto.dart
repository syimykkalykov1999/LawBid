// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_treasury_expense_dto.g.dart';

@JsonSerializable()
class CreateTreasuryExpenseDto {
  const CreateTreasuryExpenseDto({
    required this.name,
    required this.monthlyCents,
  });

  factory CreateTreasuryExpenseDto.fromJson(Map<String, Object?> json) =>
      _$CreateTreasuryExpenseDtoFromJson(json);

  final String name;

  /// A month, cents.
  final int monthlyCents;

  Map<String, Object?> toJson() => _$CreateTreasuryExpenseDtoToJson(this);
}
