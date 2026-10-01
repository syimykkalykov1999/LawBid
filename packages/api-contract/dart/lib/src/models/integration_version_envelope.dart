// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'integration_version_dto.dart';
import 'response_meta_dto.dart';

part 'integration_version_envelope.g.dart';

@JsonSerializable()
class IntegrationVersionEnvelope {
  const IntegrationVersionEnvelope({required this.data, this.meta});

  factory IntegrationVersionEnvelope.fromJson(Map<String, Object?> json) =>
      _$IntegrationVersionEnvelopeFromJson(json);

  final IntegrationVersionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$IntegrationVersionEnvelopeToJson(this);
}
