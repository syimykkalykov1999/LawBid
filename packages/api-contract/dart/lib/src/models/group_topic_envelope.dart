// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_topic_dto.dart';
import 'response_meta_dto.dart';

part 'group_topic_envelope.g.dart';

@JsonSerializable()
class GroupTopicEnvelope {
  const GroupTopicEnvelope({required this.data, this.meta});

  factory GroupTopicEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupTopicEnvelopeFromJson(json);

  final GroupTopicDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupTopicEnvelopeToJson(this);
}
