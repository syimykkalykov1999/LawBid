// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_review_workspace.dart';

part 'review_workspace_stats_dto.g.dart';

@JsonSerializable()
class ReviewWorkspaceStatsDto {
  const ReviewWorkspaceStatsDto({
    required this.workspace,
    required this.decisions,
    required this.sampled,
    required this.overturned,
    required this.overturnRate,
    required this.returnedRate,
    required this.goldenTotal,
    required this.goldenFailed,
    required this.pending,
  });

  factory ReviewWorkspaceStatsDto.fromJson(Map<String, Object?> json) =>
      _$ReviewWorkspaceStatsDtoFromJson(json);

  final StaffReviewWorkspace workspace;
  final num decisions;
  final num sampled;
  final num overturned;

  /// Percent of re-checked decisions that were overturned.
  final num? overturnRate;

  /// Percent of closed items that came back.
  final num? returnedRate;
  final num goldenTotal;
  final num goldenFailed;

  /// Samples waiting for a reviewer now.
  final num pending;

  Map<String, Object?> toJson() => _$ReviewWorkspaceStatsDtoToJson(this);
}
