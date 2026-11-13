// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_items_dto.dart';
import 'response_meta_dto.dart';

part 'ai_worker_items_envelope.g.dart';

@JsonSerializable()
class AiWorkerItemsEnvelope {
  const AiWorkerItemsEnvelope({required this.data, this.meta});

  factory AiWorkerItemsEnvelope.fromJson(Map<String, Object?> json) =>
      _$AiWorkerItemsEnvelopeFromJson(json);

  final AiWorkerItemsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AiWorkerItemsEnvelopeToJson(this);
}
