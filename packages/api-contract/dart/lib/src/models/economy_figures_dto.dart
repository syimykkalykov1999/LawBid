// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'spend_line_dto.dart';

part 'economy_figures_dto.g.dart';

@JsonSerializable()
class EconomyFiguresDto {
  const EconomyFiguresDto({
    required this.revenue30dUsd,
    required this.revenueMonthUsd,
    required this.allowedUsd,
    required this.lines,
    required this.monthToDateUsd,
    required this.projectedUsd,
  });

  factory EconomyFiguresDto.fromJson(Map<String, Object?> json) =>
      _$EconomyFiguresDtoFromJson(json);

  final num revenue30dUsd;
  final num revenueMonthUsd;

  /// Spend the rule allows this month, USD.
  final num allowedUsd;
  final List<SpendLineDto> lines;
  final num monthToDateUsd;

  /// Projected third-party spend for the month.
  final num projectedUsd;

  Map<String, Object?> toJson() => _$EconomyFiguresDtoToJson(this);
}
