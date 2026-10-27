// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_today_anomaly_dto.dart';

part 'staff_today_anomalies_dto.g.dart';

@JsonSerializable()
class StaffTodayAnomaliesDto {
  const StaffTodayAnomaliesDto({
    required this.day,
    required this.total,
    required this.items,
  });

  factory StaffTodayAnomaliesDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodayAnomaliesDtoFromJson(json);

  /// Newest day.
  final String? day;
  final int total;
  final List<StaffTodayAnomalyDto> items;

  Map<String, Object?> toJson() => _$StaffTodayAnomaliesDtoToJson(this);
}
