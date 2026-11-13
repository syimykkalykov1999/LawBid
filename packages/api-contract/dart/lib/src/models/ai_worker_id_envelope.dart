// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_id_dto.dart';
import 'response_meta_dto.dart';

part 'ai_worker_id_envelope.g.dart';

@JsonSerializable()
class AiWorkerIdEnvelope {
  const AiWorkerIdEnvelope({required this.data, this.meta});

  factory AiWorkerIdEnvelope.fromJson(Map<String, Object?> json) =>
      _$AiWorkerIdEnvelopeFromJson(json);

  final AiWorkerIdDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AiWorkerIdEnvelopeToJson(this);
}
