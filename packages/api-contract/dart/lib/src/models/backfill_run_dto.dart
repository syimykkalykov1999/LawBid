// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'backfill_run_dto_status.dart';

part 'backfill_run_dto.g.dart';

@JsonSerializable()
class BackfillRunDto {
  const BackfillRunDto({
    required this.name,
    required this.status,
    required this.tableName,
    required this.processed,
    required this.totalEstimate,
    required this.percent,
    required this.batchSize,
    required this.maxRowsPerSec,
    required this.pauseReason,
    required this.lastError,
    required this.stalled,
    required this.startedAt,
    required this.updatedAt,
  });

  factory BackfillRunDto.fromJson(Map<String, Object?> json) =>
      _$BackfillRunDtoFromJson(json);

  /// Stable backfill name.
  final String name;
  final BackfillRunDtoStatus status;

  /// Table being walked.
  final String tableName;

  /// Rows changed so far.
  final num processed;

  /// Planner estimate of the rows to walk.
  final num? totalEstimate;

  /// 0-100, null when the total is unknown.
  final num? percent;
  final num batchSize;
  final num maxRowsPerSec;

  /// Why it waits now: paused by admin, replica lag, CPU …
  final String? pauseReason;
  final String? lastError;

  /// Running but no heartbeat for 2 minutes: the runner process is gone.
  final bool stalled;
  final DateTime startedAt;
  final DateTime updatedAt;

  Map<String, Object?> toJson() => _$BackfillRunDtoToJson(this);
}
