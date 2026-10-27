// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'pnl_week_dto.g.dart';

@JsonSerializable()
class PnlWeekDto {
  const PnlWeekDto({
    required this.weekStart,
    required this.revenueUsd,
    required this.costUsd,
    required this.profitUsd,
    required this.marginPercent,
  });

  factory PnlWeekDto.fromJson(Map<String, Object?> json) =>
      _$PnlWeekDtoFromJson(json);

  final String weekStart;
  final num revenueUsd;
  final num costUsd;
  final num profitUsd;
  final num? marginPercent;

  Map<String, Object?> toJson() => _$PnlWeekDtoToJson(this);
}
