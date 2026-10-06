// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_treasury_expense_dto.g.dart';

@JsonSerializable()
class UpdateTreasuryExpenseDto {
  const UpdateTreasuryExpenseDto({this.name, this.monthlyCents, this.active});

  factory UpdateTreasuryExpenseDto.fromJson(Map<String, Object?> json) =>
      _$UpdateTreasuryExpenseDtoFromJson(json);

  final String? name;
  final int? monthlyCents;
  final bool? active;

  Map<String, Object?> toJson() => _$UpdateTreasuryExpenseDtoToJson(this);
}
