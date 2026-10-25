// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fixed_cost_view_dto_period.dart';

part 'fixed_cost_view_dto.g.dart';

@JsonSerializable()
class FixedCostViewDto {
  const FixedCostViewDto({
    required this.id,
    required this.label,
    required this.usd,
    required this.period,
    required this.monthlyUsd,
    this.paidMonth,
  });

  factory FixedCostViewDto.fromJson(Map<String, Object?> json) =>
      _$FixedCostViewDtoFromJson(json);

  final String id;
  final String label;
  final num usd;
  final FixedCostViewDtoPeriod period;

  /// YYYY-MM, for «once».
  final String? paidMonth;

  /// What it adds to this month.
  final num monthlyUsd;

  Map<String, Object?> toJson() => _$FixedCostViewDtoToJson(this);
}
