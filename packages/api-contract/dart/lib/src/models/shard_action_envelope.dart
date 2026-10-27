// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'shard_action_dto.dart';

part 'shard_action_envelope.g.dart';

@JsonSerializable()
class ShardActionEnvelope {
  const ShardActionEnvelope({required this.data, this.meta});

  factory ShardActionEnvelope.fromJson(Map<String, Object?> json) =>
      _$ShardActionEnvelopeFromJson(json);

  final ShardActionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ShardActionEnvelopeToJson(this);
}
