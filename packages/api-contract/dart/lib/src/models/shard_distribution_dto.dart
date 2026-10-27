// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'shard_distribution_dto.g.dart';

@JsonSerializable()
class ShardDistributionDto {
  const ShardDistributionDto({
    required this.database,
    required this.state,
    required this.shards,
  });

  factory ShardDistributionDto.fromJson(Map<String, Object?> json) =>
      _$ShardDistributionDtoFromJson(json);

  final String database;
  final String state;
  final num shards;

  Map<String, Object?> toJson() => _$ShardDistributionDtoToJson(this);
}
