// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'selfie_handoff_dto.dart';

part 'selfie_handoff_envelope.g.dart';

@JsonSerializable()
class SelfieHandoffEnvelope {
  const SelfieHandoffEnvelope({required this.data, this.meta});

  factory SelfieHandoffEnvelope.fromJson(Map<String, Object?> json) =>
      _$SelfieHandoffEnvelopeFromJson(json);

  final SelfieHandoffDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SelfieHandoffEnvelopeToJson(this);
}
