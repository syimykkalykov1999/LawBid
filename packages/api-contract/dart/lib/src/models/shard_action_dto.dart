// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'shard_move_dto.dart';

part 'shard_action_dto.g.dart';

@JsonSerializable()
class ShardActionDto {
  const ShardActionDto({required this.ok, required this.moves});

  factory ShardActionDto.fromJson(Map<String, Object?> json) =>
      _$ShardActionDtoFromJson(json);

  final bool ok;
  final List<ShardMoveDto> moves;

  Map<String, Object?> toJson() => _$ShardActionDtoToJson(this);
}
