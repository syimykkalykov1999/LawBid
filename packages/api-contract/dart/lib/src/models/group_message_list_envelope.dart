// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'group_message_dto.dart';
import 'response_meta_dto.dart';

part 'group_message_list_envelope.g.dart';

@JsonSerializable()
class GroupMessageListEnvelope {
  const GroupMessageListEnvelope({required this.data, this.meta});

  factory GroupMessageListEnvelope.fromJson(Map<String, Object?> json) =>
      _$GroupMessageListEnvelopeFromJson(json);

  final List<GroupMessageDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GroupMessageListEnvelopeToJson(this);
}
