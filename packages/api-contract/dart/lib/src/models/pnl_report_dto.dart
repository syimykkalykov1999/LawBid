// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'pnl_day_dto.dart';
import 'pnl_kind_line_dto.dart';
import 'pnl_period_dto.dart';
import 'pnl_week_dto.dart';

part 'pnl_report_dto.g.dart';

@JsonSerializable()
class PnlReportDto {
  const PnlReportDto({
    required this.computedAt,
    required this.asOf,
    required this.today,
    required this.week,
    required this.month,
    required this.weeks,
    required this.days,
    required this.byKind,
    required this.vendorDataFrom,
  });

  factory PnlReportDto.fromJson(Map<String, Object?> json) =>
      _$PnlReportDtoFromJson(json);

  /// Stored snapshot time; null before the first count.
  final String? computedAt;
  final String? asOf;
  final PnlPeriodDto? today;
  final PnlPeriodDto? week;
  final PnlPeriodDto? month;
  final List<PnlWeekDto> weeks;
  final List<PnlDayDto> days;
  final List<PnlKindLineDto> byKind;
  final String? vendorDataFrom;

  Map<String, Object?> toJson() => _$PnlReportDtoToJson(this);
}
