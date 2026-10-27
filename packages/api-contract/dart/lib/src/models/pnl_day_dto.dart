// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'pnl_day_dto.g.dart';

@JsonSerializable()
class PnlDayDto {
  const PnlDayDto({
    required this.day,
    required this.revenueUsd,
    required this.costUsd,
    required this.profitUsd,
  });

  factory PnlDayDto.fromJson(Map<String, Object?> json) =>
      _$PnlDayDtoFromJson(json);

  final String day;
  final num revenueUsd;
  final num costUsd;
  final num profitUsd;

  Map<String, Object?> toJson() => _$PnlDayDtoToJson(this);
}
