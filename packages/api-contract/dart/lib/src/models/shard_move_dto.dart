// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'shard_move_dto_state.dart';
import 'shard_move_dto_status.dart';

part 'shard_move_dto.g.dart';

@JsonSerializable()
class ShardMoveDto {
  const ShardMoveDto({
    required this.id,
    required this.logicalShard,
    required this.fromDb,
    required this.toDb,
    required this.state,
    required this.status,
    required this.percent,
    required this.note,
    required this.createdAt,
    this.error,
    this.flippedAt,
    this.cleanupAfter,
    this.heartbeatAt,
    this.verify,
  });

  factory ShardMoveDto.fromJson(Map<String, Object?> json) =>
      _$ShardMoveDtoFromJson(json);

  final String id;
  final num logicalShard;
  final String fromDb;
  final String toDb;
  final ShardMoveDtoState state;
  final ShardMoveDtoStatus status;

  /// 0..100, by step and copied rows
  final num percent;

  /// Last progress line
  final String note;
  final String? error;
  final String createdAt;
  final String? flippedAt;
  final String? cleanupAfter;
  final String? heartbeatAt;
  final dynamic verify;

  Map<String, Object?> toJson() => _$ShardMoveDtoToJson(this);
}
