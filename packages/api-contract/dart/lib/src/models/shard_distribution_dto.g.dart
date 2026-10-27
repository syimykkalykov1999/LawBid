// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shard_distribution_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ShardDistributionDto _$ShardDistributionDtoFromJson(
  Map<String, dynamic> json,
) => ShardDistributionDto(
  database: json['database'] as String,
  state: json['state'] as String,
  shards: json['shards'] as num,
);

Map<String, dynamic> _$ShardDistributionDtoToJson(
  ShardDistributionDto instance,
) => <String, dynamic>{
  'database': instance.database,
  'state': instance.state,
  'shards': instance.shards,
};
