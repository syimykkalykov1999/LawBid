// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_worker_model.dart';
import 'ai_worker_queue_key.dart';

part 'create_ai_role_dto.g.dart';

@JsonSerializable()
class CreateAiRoleDto {
  const CreateAiRoleDto({
    required this.name,
    required this.instructions,
    required this.queue,
    this.confidenceMin = 90,
    this.auditPct = 10,
    this.model,
  });

  factory CreateAiRoleDto.fromJson(Map<String, Object?> json) =>
      _$CreateAiRoleDtoFromJson(json);

  final String name;

  /// What the role does, in the owner’s words.
  final String instructions;
  final AiWorkerQueueKey queue;
  final AiWorkerModel? model;
  final num confidenceMin;
  final num auditPct;

  Map<String, Object?> toJson() => _$CreateAiRoleDtoToJson(this);
}
