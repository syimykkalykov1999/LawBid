// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'day_usd_dto.dart';
import 'free_tier_dto.dart';
import 'vendor_spend_dto_id.dart';
import 'vendor_spend_dto_status.dart';
import 'vendor_spend_line_dto.dart';

part 'vendor_spend_dto.g.dart';

@JsonSerializable()
class VendorSpendDto {
  const VendorSpendDto({
    required this.id,
    required this.label,
    required this.status,
    required this.error,
    required this.updatedAt,
    required this.monthToDateUsd,
    required this.lastMonthUsd,
    required this.forecastUsd,
    required this.coveredByCreditsUsd,
    required this.balanceUsd,
    required this.daily,
    required this.lines,
    required this.freeTier,
    required this.notes,
  });

  factory VendorSpendDto.fromJson(Map<String, Object?> json) =>
      _$VendorSpendDtoFromJson(json);

  final VendorSpendDtoId id;
  final String label;
  final VendorSpendDtoStatus status;
  final String? error;
  final String? updatedAt;
  final num? monthToDateUsd;
  final num? lastMonthUsd;
  final num? forecastUsd;
  final num? coveredByCreditsUsd;
  final num? balanceUsd;
  final List<DayUsdDto> daily;
  final List<VendorSpendLineDto> lines;
  final FreeTierDto? freeTier;
  final List<String> notes;

  Map<String, Object?> toJson() => _$VendorSpendDtoToJson(this);
}
