// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'own_trust_dto.dart';
import 'response_meta_dto.dart';

part 'own_trust_envelope.g.dart';

@JsonSerializable()
class OwnTrustEnvelope {
  const OwnTrustEnvelope({required this.data, this.meta});

  factory OwnTrustEnvelope.fromJson(Map<String, Object?> json) =>
      _$OwnTrustEnvelopeFromJson(json);

  final OwnTrustDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$OwnTrustEnvelopeToJson(this);
}
