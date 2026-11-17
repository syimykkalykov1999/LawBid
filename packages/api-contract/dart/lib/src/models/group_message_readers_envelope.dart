// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_message_readers_dto.dart';
import 'response_meta_dto.dart';

part 'group_message_readers_envelope.g.dart';

@JsonSerializable()
class GroupMessageReadersEnvelope {
  const GroupMessageReadersEnvelope({required this.data, this.meta});

  factory GroupMessageReadersEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupMessageReadersEnvelopeFromJson(json);

  final GroupMessageReadersDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupMessageReadersEnvelopeToJson(this);
}
