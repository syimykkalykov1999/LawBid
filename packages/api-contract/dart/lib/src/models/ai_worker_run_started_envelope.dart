// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_run_started_dto.dart';
import 'response_meta_dto.dart';

part 'ai_worker_run_started_envelope.g.dart';

@JsonSerializable()
class AiWorkerRunStartedEnvelope {
  const AiWorkerRunStartedEnvelope({required this.data, this.meta});

  factory AiWorkerRunStartedEnvelope.fromJson(Map<String, Object?> json) =>
      _$AiWorkerRunStartedEnvelopeFromJson(json);

  final AiWorkerRunStartedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AiWorkerRunStartedEnvelopeToJson(this);
}
