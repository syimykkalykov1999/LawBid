// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'aws_budget_dto.dart';

part 'aws_budgets_dto.g.dart';

@JsonSerializable()
class AwsBudgetsDto {
  const AwsBudgetsDto({required this.available, required this.items});

  factory AwsBudgetsDto.fromJson(Map<String, Object?> json) =>
      _$AwsBudgetsDtoFromJson(json);

  final bool available;
  final List<AwsBudgetDto> items;

  Map<String, Object?> toJson() => _$AwsBudgetsDtoToJson(this);
}
