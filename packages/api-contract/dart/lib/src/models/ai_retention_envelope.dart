// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_retention_dto.dart';
import 'response_meta_dto.dart';

part 'ai_retention_envelope.g.dart';

@JsonSerializable()
class AiRetentionEnvelope {
  const AiRetentionEnvelope({required this.data, this.meta});

  factory AiRetentionEnvelope.fromJson(Map<String, Object?> json) =>
      _$AiRetentionEnvelopeFromJson(json);

  final AiRetentionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AiRetentionEnvelopeToJson(this);
}
