// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_assistant_status_dto.dart';
import 'response_meta_dto.dart';

part 'ai_assistant_status_envelope.g.dart';

@JsonSerializable()
class AiAssistantStatusEnvelope {
  const AiAssistantStatusEnvelope({required this.data, this.meta});

  factory AiAssistantStatusEnvelope.fromJson(Map<String, Object?> json) =>
      _$AiAssistantStatusEnvelopeFromJson(json);

  final AiAssistantStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AiAssistantStatusEnvelopeToJson(this);
}
