// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shards_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ShardsOverviewDto _$ShardsOverviewDtoFromJson(Map<String, dynamic> json) =>
    ShardsOverviewDto(
      databases: (json['databases'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      distribution: (json['distribution'] as List<dynamic>)
          .map((e) => ShardDistributionDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      moves: (json['moves'] as List<dynamic>)
          .map((e) => ShardMoveDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      leaseHeld: json['leaseHeld'] as bool,
      orphans: json['orphans'],
    );

Map<String, dynamic> _$ShardsOverviewDtoToJson(ShardsOverviewDto instance) =>
    <String, dynamic>{
      'databases': instance.databases,
      'distribution': instance.distribution.map((e) => e.toJson()).toList(),
      'moves': instance.moves.map((e) => e.toJson()).toList(),
      'leaseHeld': instance.leaseHeld,
      'orphans': ?instance.orphans,
    };
