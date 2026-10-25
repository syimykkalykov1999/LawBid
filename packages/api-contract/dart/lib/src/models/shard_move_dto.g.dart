// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shard_move_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ShardMoveDto _$ShardMoveDtoFromJson(Map<String, dynamic> json) => ShardMoveDto(
  id: json['id'] as String,
  logicalShard: json['logicalShard'] as num,
  fromDb: json['fromDb'] as String,
  toDb: json['toDb'] as String,
  state: ShardMoveDtoState.fromJson(json['state'] as String),
  status: ShardMoveDtoStatus.fromJson(json['status'] as String),
  percent: json['percent'] as num,
  note: json['note'] as String,
  createdAt: json['createdAt'] as String,
  error: json['error'] as String?,
  flippedAt: json['flippedAt'] as String?,
  cleanupAfter: json['cleanupAfter'] as String?,
  heartbeatAt: json['heartbeatAt'] as String?,
  verify: json['verify'],
);

Map<String, dynamic> _$ShardMoveDtoToJson(ShardMoveDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'logicalShard': instance.logicalShard,
      'fromDb': instance.fromDb,
      'toDb': instance.toDb,
      'state': instance.state.toJson(),
      'status': instance.status.toJson(),
      'percent': instance.percent,
      'note': instance.note,
      'error': ?instance.error,
      'createdAt': instance.createdAt,
      'flippedAt': ?instance.flippedAt,
      'cleanupAfter': ?instance.cleanupAfter,
      'heartbeatAt': ?instance.heartbeatAt,
      'verify': ?instance.verify,
    };
