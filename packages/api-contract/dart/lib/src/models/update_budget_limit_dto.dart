// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_budget_limit_dto_mode.dart';

part 'update_budget_limit_dto.g.dart';

@JsonSerializable()
class UpdateBudgetLimitDto {
  const UpdateBudgetLimitDto({
    required this.mode,
    this.floor,
    this.ceiling,
    this.value,
  });

  factory UpdateBudgetLimitDto.fromJson(Map<String, Object?> json) =>
      _$UpdateBudgetLimitDtoFromJson(json);

  /// auto: the cap follows real usage hourly within [floor, ceiling]; manual: the cap is `value`.
  final UpdateBudgetLimitDtoMode mode;

  /// Auto mode: the cap never goes below this.
  final int? floor;

  /// Auto mode: safety ceiling, the cap never goes above this.
  final int? ceiling;

  /// Manual mode: the cap (0 switches the provider off). Omitted keeps the current cap.
  final int? value;

  Map<String, Object?> toJson() => _$UpdateBudgetLimitDtoToJson(this);
}
