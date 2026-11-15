// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'tier_row_dto.dart';

part 'capacity_dto.g.dart';

@JsonSerializable()
class CapacityDto {
  const CapacityDto({
    required this.onAws,
    required this.dbTiers,
    required this.redisTiers,
    this.at,
    this.dbClass,
    this.dbNext,
    this.dbCpuPercent,
    this.dbConnections,
    this.dbMaxConnections,
    this.dbStorageGb,
    this.dbStorageUsd,
    this.dbMultiAz,
    this.replicaCount,
    this.redisClass,
    this.redisNodes,
    this.redisNext,
    this.redisMemoryPercent,
  });

  factory CapacityDto.fromJson(Map<String, Object?> json) =>
      _$CapacityDtoFromJson(json);

  /// The database / Redis can be read and resized.
  final bool onAws;
  final String? at;
  final String? dbClass;
  final String? dbNext;
  final num? dbCpuPercent;
  final num? dbConnections;
  final num? dbMaxConnections;

  /// Allocated database disk, GB.
  final num? dbStorageGb;

  /// Monthly price of that disk (gp3), USD.
  final num? dbStorageUsd;

  /// The database has a standby in a second zone (Multi-AZ).
  final bool? dbMultiAz;

  /// Read copies of the database that report load now.
  final num? replicaCount;
  final String? redisClass;

  /// Redis nodes in the group (primary + standbys).
  final num? redisNodes;
  final String? redisNext;
  final num? redisMemoryPercent;
  final List<TierRowDto> dbTiers;
  final List<TierRowDto> redisTiers;

  Map<String, Object?> toJson() => _$CapacityDtoToJson(this);
}
