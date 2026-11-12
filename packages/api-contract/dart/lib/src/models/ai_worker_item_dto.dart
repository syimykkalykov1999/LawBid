// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_attachment_view_dto.dart';
import 'ai_worker_evidence_dto.dart';
import 'ai_worker_item_dto_decision.dart';
import 'ai_worker_item_dto_lane.dart';

part 'ai_worker_item_dto.g.dart';

@JsonSerializable()
class AiWorkerItemDto {
  const AiWorkerItemDto({
    required this.id,
    required this.runId,
    required this.roleName,
    required this.itemId,
    required this.status,
    required this.decision,
    required this.confidence,
    required this.lane,
    required this.flags,
    required this.reasons,
    required this.evidence,
    required this.ownerDecision,
    required this.ownerNote,
    required this.draftNote,
    required this.injectionSuspected,
    required this.error,
    required this.costCents,
    required this.reviewedAt,
    required this.images,
  });

  factory AiWorkerItemDto.fromJson(Map<String, Object?> json) =>
      _$AiWorkerItemDtoFromJson(json);

  final String id;
  final String runId;
  final String roleName;

  /// The queue item (request id).
  final String itemId;
  final String status;
  final AiWorkerItemDtoDecision? decision;
  final num? confidence;
  final AiWorkerItemDtoLane? lane;

  /// Platform red flags.
  final List<String> flags;
  final List<String> reasons;
  final List<AiWorkerEvidenceDto> evidence;
  final String? ownerDecision;
  final String? ownerNote;
  final String draftNote;
  final bool injectionSuspected;
  final String? error;
  final num costCents;
  final DateTime? reviewedAt;

  /// Pictures of the owner’s correction note.
  final List<AiAttachmentViewDto> images;

  Map<String, Object?> toJson() => _$AiWorkerItemDtoToJson(this);
}
