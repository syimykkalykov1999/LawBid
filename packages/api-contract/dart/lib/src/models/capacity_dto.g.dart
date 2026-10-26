// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'capacity_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CapacityDto _$CapacityDtoFromJson(Map<String, dynamic> json) => CapacityDto(
  onAws: json['onAws'] as bool,
  dbTiers: (json['dbTiers'] as List<dynamic>)
      .map((e) => TierRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  redisTiers: (json['redisTiers'] as List<dynamic>)
      .map((e) => TierRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  at: json['at'] as String?,
  dbClass: json['dbClass'] as String?,
  dbNext: json['dbNext'] as String?,
  dbCpuPercent: json['dbCpuPercent'] as num?,
  dbConnections: json['dbConnections'] as num?,
  dbMaxConnections: json['dbMaxConnections'] as num?,
  redisClass: json['redisClass'] as String?,
  redisNext: json['redisNext'] as String?,
  redisMemoryPercent: json['redisMemoryPercent'] as num?,
);

Map<String, dynamic> _$CapacityDtoToJson(CapacityDto instance) =>
    <String, dynamic>{
      'onAws': instance.onAws,
      'at': ?instance.at,
      'dbClass': ?instance.dbClass,
      'dbNext': ?instance.dbNext,
      'dbCpuPercent': ?instance.dbCpuPercent,
      'dbConnections': ?instance.dbConnections,
      'dbMaxConnections': ?instance.dbMaxConnections,
      'redisClass': ?instance.redisClass,
      'redisNext': ?instance.redisNext,
      'redisMemoryPercent': ?instance.redisMemoryPercent,
      'dbTiers': instance.dbTiers.map((e) => e.toJson()).toList(),
      'redisTiers': instance.redisTiers.map((e) => e.toJson()).toList(),
    };
