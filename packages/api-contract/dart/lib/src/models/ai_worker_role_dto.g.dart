// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_role_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerRoleDto _$AiWorkerRoleDtoFromJson(Map<String, dynamic> json) =>
    AiWorkerRoleDto(
      id: json['id'] as String,
      name: json['name'] as String,
      instructions: json['instructions'] as String,
      queue: AiWorkerQueueKey.fromJson(json['queue'] as String),
      model: AiWorkerModel.fromJson(json['model'] as String),
      confidenceMin: json['confidenceMin'] as num,
      auditPct: json['auditPct'] as num,
      enabled: json['enabled'] as bool,
      autoSend: json['autoSend'] as bool,
      reviewed: json['reviewed'] as num,
      agreed: json['agreed'] as num,
      agreementPct: json['agreementPct'] as num?,
      images: (json['images'] as List<dynamic>)
          .map((e) => AiAttachmentViewDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AiWorkerRoleDtoToJson(AiWorkerRoleDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'instructions': instance.instructions,
      'queue': instance.queue.toJson(),
      'model': instance.model.toJson(),
      'confidenceMin': instance.confidenceMin,
      'auditPct': instance.auditPct,
      'enabled': instance.enabled,
      'autoSend': instance.autoSend,
      'reviewed': instance.reviewed,
      'agreed': instance.agreed,
      'agreementPct': ?instance.agreementPct,
      'images': instance.images.map((e) => e.toJson()).toList(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
