// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'message_dto.dart';
import 'response_meta_dto.dart';

part 'message_list_envelope.g.dart';

@JsonSerializable()
class MessageListEnvelope {
  const MessageListEnvelope({required this.data, this.meta});

  factory MessageListEnvelope.fromJson(Map<String, Object?> json) =>
      _$MessageListEnvelopeFromJson(json);

  final List<MessageDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MessageListEnvelopeToJson(this);
}
