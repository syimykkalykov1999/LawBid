// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_stats_day_dto.dart';
import 'hotline_stats_row_dto.dart';
import 'hotline_stats_totals_dto.dart';

part 'hotline_stats_dto.g.dart';

@JsonSerializable()
class HotlineStatsDto {
  const HotlineStatsDto({
    required this.computedAt,
    required this.days,
    required this.totals,
    required this.states,
    required this.practices,
    required this.endReasons,
  });

  factory HotlineStatsDto.fromJson(Map<String, Object?> json) =>
      _$HotlineStatsDtoFromJson(json);

  /// ISO time the snapshot was counted
  final String computedAt;
  final List<HotlineStatsDayDto> days;
  final HotlineStatsTotalsDto totals;
  final List<HotlineStatsRowDto> states;
  final List<HotlineStatsRowDto> practices;
  final List<HotlineStatsRowDto> endReasons;

  Map<String, Object?> toJson() => _$HotlineStatsDtoToJson(this);
}
