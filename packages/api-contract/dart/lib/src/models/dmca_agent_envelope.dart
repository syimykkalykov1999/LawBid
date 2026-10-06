// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dmca_agent_dto.dart';
import 'response_meta_dto.dart';

part 'dmca_agent_envelope.g.dart';

@JsonSerializable()
class DmcaAgentEnvelope {
  const DmcaAgentEnvelope({required this.data, this.meta});

  factory DmcaAgentEnvelope.fromJson(Map<String, Object?> json) =>
      _$DmcaAgentEnvelopeFromJson(json);

  final DmcaAgentDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DmcaAgentEnvelopeToJson(this);
}
