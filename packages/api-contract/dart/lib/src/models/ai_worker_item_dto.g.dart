// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerItemDto _$AiWorkerItemDtoFromJson(Map<String, dynamic> json) =>
    AiWorkerItemDto(
      id: json['id'] as String,
      runId: json['runId'] as String,
      roleName: json['roleName'] as String,
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
      reasons: (json['reasons'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      evidence: (json['evidence'] as List<dynamic>)
          .map((e) => AiWorkerEvidenceDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      ownerDecision: json['ownerDecision'] as String?,
      ownerNote: json['ownerNote'] as String?,
      draftNote: json['draftNote'] as String,
      injectionSuspected: json['injectionSuspected'] as bool,
      error: json['error'] as String?,
      costCents: json['costCents'] as num,
      reviewedAt: json['reviewedAt'] == null
          ? null
          : DateTime.parse(json['reviewedAt'] as String),
    );

Map<String, dynamic> _$AiWorkerItemDtoToJson(AiWorkerItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'runId': instance.runId,
      'roleName': instance.roleName,
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
      'error': ?instance.error,
      'costCents': instance.costCents,
      'reviewedAt': ?instance.reviewedAt?.toIso8601String(),
    };
