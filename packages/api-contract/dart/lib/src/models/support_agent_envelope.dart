// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'support_agent_dto.dart';

part 'support_agent_envelope.g.dart';

@JsonSerializable()
class SupportAgentEnvelope {
  const SupportAgentEnvelope({required this.data, this.meta});

  factory SupportAgentEnvelope.fromJson(Map<String, Object?> json) =>
      _$SupportAgentEnvelopeFromJson(json);

  final SupportAgentDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SupportAgentEnvelopeToJson(this);
}
