// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shard_action_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ShardActionDto _$ShardActionDtoFromJson(Map<String, dynamic> json) =>
    ShardActionDto(
      ok: json['ok'] as bool,
      moves: (json['moves'] as List<dynamic>)
          .map((e) => ShardMoveDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ShardActionDtoToJson(ShardActionDto instance) =>
    <String, dynamic>{
      'ok': instance.ok,
      'moves': instance.moves.map((e) => e.toJson()).toList(),
    };
