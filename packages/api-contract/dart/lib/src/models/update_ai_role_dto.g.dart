// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_ai_role_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateAiRoleDto _$UpdateAiRoleDtoFromJson(Map<String, dynamic> json) =>
    UpdateAiRoleDto(
      confidenceMin: json['confidenceMin'] as num? ?? 90,
      auditPct: json['auditPct'] as num? ?? 10,
      name: json['name'] as String?,
      instructions: json['instructions'] as String?,
      queue: json['queue'] == null
          ? null
          : AiWorkerQueueKey.fromJson(json['queue'] as String),
      model: json['model'] == null
          ? null
          : AiWorkerModel.fromJson(json['model'] as String),
    );

Map<String, dynamic> _$UpdateAiRoleDtoToJson(UpdateAiRoleDto instance) =>
    <String, dynamic>{
      'name': ?instance.name,
      'instructions': ?instance.instructions,
      'queue': ?instance.queue?.toJson(),
      'model': ?instance.model?.toJson(),
      'confidenceMin': instance.confidenceMin,
      'auditPct': instance.auditPct,
    };
