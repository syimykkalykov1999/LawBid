// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'review_calibration_dto.dart';
import 'review_workspace_stats_dto.dart';

part 'review_stats_dto.g.dart';

@JsonSerializable()
class ReviewStatsDto {
  const ReviewStatsDto({
    required this.snapshotDate,
    required this.workspaces,
    required this.calibration,
  });

  factory ReviewStatsDto.fromJson(Map<String, Object?> json) =>
      _$ReviewStatsDtoFromJson(json);

  final String? snapshotDate;
  final List<ReviewWorkspaceStatsDto> workspaces;
  final List<ReviewCalibrationDto> calibration;

  Map<String, Object?> toJson() => _$ReviewStatsDtoToJson(this);
}
