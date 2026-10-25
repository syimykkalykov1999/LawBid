// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fixed_cost_dto_period.dart';

part 'fixed_cost_dto.g.dart';

@JsonSerializable()
class FixedCostDto {
  const FixedCostDto({
    required this.id,
    required this.label,
    required this.usd,
    required this.period,
    this.paidMonth,
  });

  factory FixedCostDto.fromJson(Map<String, Object?> json) =>
      _$FixedCostDtoFromJson(json);

  final String id;
  final String label;
  final num usd;
  final FixedCostDtoPeriod period;

  /// YYYY-MM, for «once».
  final String? paidMonth;

  Map<String, Object?> toJson() => _$FixedCostDtoToJson(this);
}
