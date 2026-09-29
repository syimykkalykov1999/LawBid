// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_conversation_dto.dart';
import 'response_meta_dto.dart';

part 'case_conversation_envelope.g.dart';

@JsonSerializable()
class CaseConversationEnvelope {
  const CaseConversationEnvelope({required this.data, this.meta});

  factory CaseConversationEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseConversationEnvelopeFromJson(json);

  final CaseConversationDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseConversationEnvelopeToJson(this);
}
