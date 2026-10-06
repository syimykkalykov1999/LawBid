// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'budget_limit_dto_mode.dart';
import 'budget_limit_dto_provider.dart';
import 'budget_limit_dto_window.dart';

part 'budget_limit_dto.g.dart';

@JsonSerializable()
class BudgetLimitDto {
  const BudgetLimitDto({
    required this.provider,
    required this.window,
    required this.mode,
    required this.floor,
    required this.ceiling,
    required this.cap,
    required this.envDefault,
    required this.usedToday,
    required this.usedThisMonth,
    required this.lastAutoAt,
  });

  factory BudgetLimitDto.fromJson(Map<String, Object?> json) =>
      _$BudgetLimitDtoFromJson(json);

  final BudgetLimitDtoProvider provider;
  final BudgetLimitDtoWindow window;
  final BudgetLimitDtoMode mode;
  final int floor;
  final int ceiling;

  /// Cap in force now (0 = provider switched off).
  final int cap;

  /// Server default (BUDGET_* env).
  final int envDefault;
  final int usedToday;
  final int usedThisMonth;

  /// Last automatic recompute of this provider.
  final DateTime? lastAutoAt;

  Map<String, Object?> toJson() => _$BudgetLimitDtoToJson(this);
}
