// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'integration_reveal_dto.dart';
import 'response_meta_dto.dart';

part 'integration_reveal_envelope.g.dart';

@JsonSerializable()
class IntegrationRevealEnvelope {
  const IntegrationRevealEnvelope({required this.data, this.meta});

  factory IntegrationRevealEnvelope.fromJson(Map<String, Object?> json) =>
      _$IntegrationRevealEnvelopeFromJson(json);

  final IntegrationRevealDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$IntegrationRevealEnvelopeToJson(this);
}
