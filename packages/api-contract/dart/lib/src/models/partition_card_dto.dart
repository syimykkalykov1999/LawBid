// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partition_card_dto_mode.dart';
import 'partition_card_dto_state.dart';

part 'partition_card_dto.g.dart';

@JsonSerializable()
class PartitionCardDto {
  const PartitionCardDto({
    required this.table,
    required this.label,
    required this.rows,
    required this.bytes,
    required this.partitioned,
    required this.partitions,
    required this.state,
    required this.blockedBy,
    required this.progress,
    required this.phase,
    required this.error,
    required this.paused,
    required this.canStart,
    required this.canUndo,
    required this.canFinalize,
    required this.finalizeAfter,
    required this.overThreshold,
    required this.runnerConfigured,
    required this.mode,
    required this.autoRows,
  });

  factory PartitionCardDto.fromJson(Map<String, Object?> json) =>
      _$PartitionCardDtoFromJson(json);

  final String table;

  /// Russian name of the table.
  final String label;

  /// Estimated rows.
  final int rows;

  /// Bytes with indexes.
  final int bytes;
  final bool partitioned;
  final int partitions;
  final PartitionCardDtoState state;

  /// Why it cannot be converted yet.
  final List<String> blockedBy;
  final int? progress;
  final String? phase;
  final String? error;
  final bool paused;
  final bool canStart;
  final bool canUndo;
  final bool canFinalize;
  final DateTime? finalizeAfter;

  /// More than 50 million rows and not partitioned.
  final bool overThreshold;

  /// The owner-role connection for the runner exists.
  final bool runnerConfigured;

  /// Hash tables: off (default) / on (convert now) / auto (convert at autoRows). Null for the monthly tables.
  final PartitionCardDtoMode? mode;

  /// Rows at which «auto» converts (admin-editable).
  final int autoRows;

  Map<String, Object?> toJson() => _$PartitionCardDtoToJson(this);
}
