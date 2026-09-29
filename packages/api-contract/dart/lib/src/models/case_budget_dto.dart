// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'budget_mode.dart';

part 'case_budget_dto.g.dart';

@JsonSerializable()
class CaseBudgetDto {
  const CaseBudgetDto({required this.mode, this.amountCents});

  factory CaseBudgetDto.fromJson(Map<String, Object?> json) =>
      _$CaseBudgetDtoFromJson(json);

  final BudgetMode mode;
  final int? amountCents;

  Map<String, Object?> toJson() => _$CaseBudgetDtoToJson(this);
}
