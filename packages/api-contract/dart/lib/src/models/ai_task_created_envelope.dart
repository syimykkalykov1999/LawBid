// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_task_created_dto.dart';
import 'response_meta_dto.dart';

part 'ai_task_created_envelope.g.dart';

@JsonSerializable()
class AiTaskCreatedEnvelope {
  const AiTaskCreatedEnvelope({required this.data, this.meta});

  factory AiTaskCreatedEnvelope.fromJson(Map<String, Object?> json) =>
      _$AiTaskCreatedEnvelopeFromJson(json);

  final AiTaskCreatedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AiTaskCreatedEnvelopeToJson(this);
}
