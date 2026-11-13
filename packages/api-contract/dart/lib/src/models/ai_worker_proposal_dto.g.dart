// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_proposal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerProposalDto _$AiWorkerProposalDtoFromJson(Map<String, dynamic> json) =>
    AiWorkerProposalDto(
      queue: AiWorkerQueueKey.fromJson(json['queue'] as String),
      label: json['label'] as String,
      open: json['open'] as num,
      roleId: json['roleId'] as String?,
      text: json['text'] as String,
      examples: (json['examples'] as List<dynamic>)
          .map((e) => AiWorkerExampleDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$AiWorkerProposalDtoToJson(
  AiWorkerProposalDto instance,
) => <String, dynamic>{
  'queue': instance.queue.toJson(),
  'label': instance.label,
  'open': instance.open,
  'roleId': ?instance.roleId,
  'text': instance.text,
  'examples': instance.examples.map((e) => e.toJson()).toList(),
};
