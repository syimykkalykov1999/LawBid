// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'verification_handoff_dto.dart';

part 'verification_handoff_envelope.g.dart';

@JsonSerializable()
class VerificationHandoffEnvelope {
  const VerificationHandoffEnvelope({required this.data, this.meta});

  factory VerificationHandoffEnvelope.fromJson(Map<String, Object?> json) =>
      _$VerificationHandoffEnvelopeFromJson(json);

  final VerificationHandoffDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$VerificationHandoffEnvelopeToJson(this);
}
