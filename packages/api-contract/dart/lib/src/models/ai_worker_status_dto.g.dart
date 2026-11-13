// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerStatusDto _$AiWorkerStatusDtoFromJson(Map<String, dynamic> json) =>
    AiWorkerStatusDto(
      enabled: json['enabled'] as bool,
      budgetCents: json['budgetCents'] as num,
      spentCents: json['spentCents'] as num,
      models: (json['models'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      defaultModel: json['defaultModel'] as String,
      queues: (json['queues'] as List<dynamic>)
          .map((e) => AiWorkerQueueDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      toReview: json['toReview'] as num,
      toReviewByLane: AiWorkerLaneCountsDto.fromJson(
        json['toReviewByLane'] as Map<String, dynamic>,
      ),
      roles: (json['roles'] as List<dynamic>)
          .map((e) => AiWorkerRoleDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      runs: (json['runs'] as List<dynamic>)
          .map((e) => AiWorkerRunDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      proposals: (json['proposals'] as List<dynamic>)
          .map((e) => AiWorkerProposalDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$AiWorkerStatusDtoToJson(AiWorkerStatusDto instance) =>
    <String, dynamic>{
      'enabled': instance.enabled,
      'budgetCents': instance.budgetCents,
      'spentCents': instance.spentCents,
      'models': instance.models,
      'defaultModel': instance.defaultModel,
      'queues': instance.queues.map((e) => e.toJson()).toList(),
      'toReview': instance.toReview,
      'toReviewByLane': instance.toReviewByLane.toJson(),
      'roles': instance.roles.map((e) => e.toJson()).toList(),
      'runs': instance.runs.map((e) => e.toJson()).toList(),
      'proposals': instance.proposals.map((e) => e.toJson()).toList(),
    };
