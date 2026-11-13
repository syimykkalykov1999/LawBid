// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ai_attachment_view_dto.dart';
import 'ai_worker_action.dart';
import 'ai_worker_evidence_dto.dart';
import 'ai_worker_item_dto_decision.dart';
import 'ai_worker_item_dto_lane.dart';
import 'ai_worker_queue_key.dart';
import 'ai_worker_registry_link_dto.dart';

part 'ai_worker_item_dto.g.dart';

@JsonSerializable()
class AiWorkerItemDto {
  const AiWorkerItemDto({
    required this.id,
    required this.runId,
    required this.roleName,
    required this.queue,
    required this.openPath,
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
    required this.reply,
    required this.action,
    required this.deliveredAt,
    required this.registryLinks,
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
  final AiWorkerQueueKey queue;

  /// The admin page of the item (request, ticket, report card).
  final String? openPath;

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

  /// Support queue: the draft answer to the user (sent on «Утвердить»).
  final String reply;

  /// Complaint queue: the proposed step (never applied).
  final AiWorkerAction action;

  /// When the support reply went to the user.
  final DateTime? deliveredAt;

  /// Registries the owner checks by hand (no automatic source).
  final List<AiWorkerRegistryLinkDto> registryLinks;
  final String? error;
  final num costCents;
  final DateTime? reviewedAt;

  /// Pictures of the owner’s correction note.
  final List<AiAttachmentViewDto> images;

  Map<String, Object?> toJson() => _$AiWorkerItemDtoToJson(this);
}
