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
    this.imageFileIds,
    this.enabled,
    this.autoSend,
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

  /// Owner 2026-11-12: confirmed ai_attachment uploads (POST admin/ai-attachments/uploads); the exact set replaces the old one.
  final List<String>? imageFileIds;

  /// Owner 2026-11-12 (row 53): «Вкл / Выкл».
  final bool? enabled;

  /// Owner 2026-11-12 (row 51): «Отправлять уверенные ответы сам» (support replies only).
  final bool? autoSend;

  Map<String, Object?> toJson() => _$CreateAiRoleDtoToJson(this);
}
