// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'conversation_e2ee_dto.dart';
import 'response_meta_dto.dart';

part 'conversation_e2ee_envelope.g.dart';

@JsonSerializable()
class ConversationE2eeEnvelope {
  const ConversationE2eeEnvelope({required this.data, this.meta});

  factory ConversationE2eeEnvelope.fromJson(Map<String, Object?> json) =>
      _$ConversationE2eeEnvelopeFromJson(json);

  final ConversationE2eeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ConversationE2eeEnvelopeToJson(this);
}
