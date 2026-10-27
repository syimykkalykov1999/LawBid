// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_today_anomaly_dto.g.dart';

@JsonSerializable()
class StaffTodayAnomalyDto {
  const StaffTodayAnomalyDto({
    required this.adminId,
    required this.name,
    required this.rule,
    required this.ruleLabel,
    required this.score,
  });

  factory StaffTodayAnomalyDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodayAnomalyDtoFromJson(json);

  final String adminId;
  final String name;
  final String rule;
  final String ruleLabel;
  final int score;

  Map<String, Object?> toJson() => _$StaffTodayAnomalyDtoToJson(this);
}
