// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_attachment_view_dto.dart';
import 'ai_worker_model.dart';
import 'ai_worker_queue_key.dart';

part 'ai_worker_role_dto.g.dart';

@JsonSerializable()
class AiWorkerRoleDto {
  const AiWorkerRoleDto({
    required this.id,
    required this.name,
    required this.instructions,
    required this.queue,
    required this.model,
    required this.confidenceMin,
    required this.auditPct,
    required this.enabled,
    required this.autoSend,
    required this.reviewed,
    required this.agreed,
    required this.agreementPct,
    required this.images,
    required this.createdAt,
  });

  factory AiWorkerRoleDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerRoleDtoFromJson(json);

  final String id;
  final String name;
  final String instructions;
  final AiWorkerQueueKey queue;
  final AiWorkerModel model;

  /// Bulk lane from this confidence (0-100).
  final num confidenceMin;

  /// % of confident proposals still audited.
  final num auditPct;

  /// Owner 2026-11-12 (row 53): «Вкл / Выкл». Off = no run, no AI call, the cron skips it.
  final bool enabled;

  /// Owner 2026-11-12 (row 51): «Отправлять уверенные ответы сам» (support replies; default off).
  final bool autoSend;

  /// Proposals the owner decided.
  final num reviewed;

  /// Of them, the owner agreed.
  final num agreed;

  /// Agreement with the owner, %.
  final num? agreementPct;

  /// Example screenshots / instructions of the role.
  final List<AiAttachmentViewDto> images;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AiWorkerRoleDtoToJson(this);
}
