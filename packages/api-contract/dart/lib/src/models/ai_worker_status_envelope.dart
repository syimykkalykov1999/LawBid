// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_status_dto.dart';
import 'response_meta_dto.dart';

part 'ai_worker_status_envelope.g.dart';

@JsonSerializable()
class AiWorkerStatusEnvelope {
  const AiWorkerStatusEnvelope({required this.data, this.meta});

  factory AiWorkerStatusEnvelope.fromJson(Map<String, Object?> json) =>
      _$AiWorkerStatusEnvelopeFromJson(json);

  final AiWorkerStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AiWorkerStatusEnvelopeToJson(this);
}
