// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'state_registry_dto.dart';

part 'state_registry_envelope.g.dart';

@JsonSerializable()
class StateRegistryEnvelope {
  const StateRegistryEnvelope({required this.data, this.meta});

  factory StateRegistryEnvelope.fromJson(Map<String, Object?> json) =>
      _$StateRegistryEnvelopeFromJson(json);

  final StateRegistryDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StateRegistryEnvelopeToJson(this);
}
