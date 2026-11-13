// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_reviewed_dto.dart';
import 'response_meta_dto.dart';

part 'ai_worker_reviewed_envelope.g.dart';

@JsonSerializable()
class AiWorkerReviewedEnvelope {
  const AiWorkerReviewedEnvelope({required this.data, this.meta});

  factory AiWorkerReviewedEnvelope.fromJson(Map<String, Object?> json) =>
      _$AiWorkerReviewedEnvelopeFromJson(json);

  final AiWorkerReviewedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AiWorkerReviewedEnvelopeToJson(this);
}
