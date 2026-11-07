// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'verification_handoff_status_dto.dart';

part 'verification_handoff_status_envelope.g.dart';

@JsonSerializable()
class VerificationHandoffStatusEnvelope {
  const VerificationHandoffStatusEnvelope({required this.data, this.meta});

  factory VerificationHandoffStatusEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$VerificationHandoffStatusEnvelopeFromJson(json);

  final VerificationHandoffStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$VerificationHandoffStatusEnvelopeToJson(this);
}
