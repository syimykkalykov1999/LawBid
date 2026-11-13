// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerItemDto _$AiWorkerItemDtoFromJson(
  Map<String, dynamic> json,
) => AiWorkerItemDto(
  id: json['id'] as String,
  runId: json['runId'] as String,
  roleName: json['roleName'] as String,
  queue: AiWorkerQueueKey.fromJson(json['queue'] as String),
  openPath: json['openPath'] as String?,
  itemId: json['itemId'] as String,
  status: json['status'] as String,
  decision: json['decision'] == null
      ? null
      : AiWorkerItemDtoDecision.fromJson(json['decision'] as String),
  confidence: json['confidence'] as num?,
  lane: json['lane'] == null
      ? null
      : AiWorkerItemDtoLane.fromJson(json['lane'] as String),
  flags: (json['flags'] as List<dynamic>).map((e) => e as String).toList(),
  reasons: (json['reasons'] as List<dynamic>).map((e) => e as String).toList(),
  evidence: (json['evidence'] as List<dynamic>)
      .map((e) => AiWorkerEvidenceDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  ownerDecision: json['ownerDecision'] as String?,
  ownerNote: json['ownerNote'] as String?,
  draftNote: json['draftNote'] as String,
  injectionSuspected: json['injectionSuspected'] as bool,
  reply: json['reply'] as String,
  action: AiWorkerAction.fromJson(json['action'] as String),
  deliveredAt: json['deliveredAt'] == null
      ? null
      : DateTime.parse(json['deliveredAt'] as String),
  registryLinks: (json['registryLinks'] as List<dynamic>)
      .map((e) => AiWorkerRegistryLinkDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  error: json['error'] as String?,
  costCents: json['costCents'] as num,
  reviewedAt: json['reviewedAt'] == null
      ? null
      : DateTime.parse(json['reviewedAt'] as String),
  images: (json['images'] as List<dynamic>)
      .map((e) => AiAttachmentViewDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AiWorkerItemDtoToJson(AiWorkerItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'runId': instance.runId,
      'roleName': instance.roleName,
      'queue': instance.queue.toJson(),
      'openPath': ?instance.openPath,
      'itemId': instance.itemId,
      'status': instance.status,
      'decision': ?instance.decision?.toJson(),
      'confidence': ?instance.confidence,
      'lane': ?instance.lane?.toJson(),
      'flags': instance.flags,
      'reasons': instance.reasons,
      'evidence': instance.evidence.map((e) => e.toJson()).toList(),
      'ownerDecision': ?instance.ownerDecision,
      'ownerNote': ?instance.ownerNote,
      'draftNote': instance.draftNote,
      'injectionSuspected': instance.injectionSuspected,
      'reply': instance.reply,
      'action': instance.action.toJson(),
      'deliveredAt': ?instance.deliveredAt?.toIso8601String(),
      'registryLinks': instance.registryLinks.map((e) => e.toJson()).toList(),
      'error': ?instance.error,
      'costCents': instance.costCents,
      'reviewedAt': ?instance.reviewedAt?.toIso8601String(),
      'images': instance.images.map((e) => e.toJson()).toList(),
    };
