// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'shard_move_dto.dart';

part 'shard_move_envelope.g.dart';

@JsonSerializable()
class ShardMoveEnvelope {
  const ShardMoveEnvelope({required this.data, this.meta});

  factory ShardMoveEnvelope.fromJson(Map<String, Object?> json) =>
      _$ShardMoveEnvelopeFromJson(json);

  final ShardMoveDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ShardMoveEnvelopeToJson(this);
}
