// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'age_gate_config_dto.dart';
import 'response_meta_dto.dart';

part 'age_gate_config_envelope.g.dart';

@JsonSerializable()
class AgeGateConfigEnvelope {
  const AgeGateConfigEnvelope({required this.data, this.meta});

  factory AgeGateConfigEnvelope.fromJson(Map<String, Object?> json) =>
      _$AgeGateConfigEnvelopeFromJson(json);

  final AgeGateConfigDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AgeGateConfigEnvelopeToJson(this);
}
