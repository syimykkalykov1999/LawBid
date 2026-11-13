// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_ai_role_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateAiRoleDto _$CreateAiRoleDtoFromJson(Map<String, dynamic> json) =>
    CreateAiRoleDto(
      name: json['name'] as String,
      instructions: json['instructions'] as String,
      queue: AiWorkerQueueKey.fromJson(json['queue'] as String),
      confidenceMin: json['confidenceMin'] as num? ?? 90,
      auditPct: json['auditPct'] as num? ?? 10,
      model: json['model'] == null
          ? null
          : AiWorkerModel.fromJson(json['model'] as String),
      imageFileIds: (json['imageFileIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$CreateAiRoleDtoToJson(CreateAiRoleDto instance) =>
    <String, dynamic>{
      'name': instance.name,
      'instructions': instance.instructions,
      'queue': instance.queue.toJson(),
      'model': ?instance.model?.toJson(),
      'confidenceMin': instance.confidenceMin,
      'auditPct': instance.auditPct,
      'imageFileIds': ?instance.imageFileIds,
    };
