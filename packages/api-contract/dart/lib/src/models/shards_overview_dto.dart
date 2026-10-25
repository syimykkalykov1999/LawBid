// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'shard_distribution_dto.dart';
import 'shard_move_dto.dart';

part 'shards_overview_dto.g.dart';

@JsonSerializable()
class ShardsOverviewDto {
  const ShardsOverviewDto({
    required this.databases,
    required this.distribution,
    required this.moves,
    required this.leaseHeld,
    this.orphans,
  });

  factory ShardsOverviewDto.fromJson(Map<String, Object?> json) =>
      _$ShardsOverviewDtoFromJson(json);

  final List<String> databases;

  /// shards per database and state
  final List<ShardDistributionDto> distribution;
  final List<ShardMoveDto> moves;
  final bool leaseHeld;

  /// last orphan check
  final dynamic orphans;

  Map<String, Object?> toJson() => _$ShardsOverviewDtoToJson(this);
}
