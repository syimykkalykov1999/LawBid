// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'pnl_period_dto.g.dart';

@JsonSerializable()
class PnlPeriodDto {
  const PnlPeriodDto({
    required this.revenueUsd,
    required this.vendorCostUsd,
    required this.fixedCostUsd,
    required this.costUsd,
    required this.profitUsd,
    required this.marginPercent,
  });

  factory PnlPeriodDto.fromJson(Map<String, Object?> json) =>
      _$PnlPeriodDtoFromJson(json);

  final num revenueUsd;
  final num vendorCostUsd;
  final num fixedCostUsd;
  final num costUsd;
  final num profitUsd;
  final num? marginPercent;

  Map<String, Object?> toJson() => _$PnlPeriodDtoToJson(this);
}
