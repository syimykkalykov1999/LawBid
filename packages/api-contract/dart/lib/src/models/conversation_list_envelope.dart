// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'conversation_dto.dart';
import 'response_meta_dto.dart';

part 'conversation_list_envelope.g.dart';

@JsonSerializable()
class ConversationListEnvelope {
  const ConversationListEnvelope({required this.data, this.meta});

  factory ConversationListEnvelope.fromJson(Map<String, Object?> json) =>
      _$ConversationListEnvelopeFromJson(json);

  final List<ConversationDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ConversationListEnvelopeToJson(this);
}
