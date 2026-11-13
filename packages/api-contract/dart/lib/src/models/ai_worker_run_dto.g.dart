// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_worker_run_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiWorkerRunDto _$AiWorkerRunDtoFromJson(Map<String, dynamic> json) =>
    AiWorkerRunDto(
      id: json['id'] as String,
      roleId: json['roleId'] as String,
      roleName: json['roleName'] as String,
      status: AiWorkerRunStatus.fromJson(json['status'] as String),
      model: json['model'] as String,
      total: json['total'] as num,
      proposed: json['proposed'] as num,
      failed: json['failed'] as num,
      inFlight: json['inFlight'] as bool,
      costCents: json['costCents'] as num,
      error: json['error'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      finishedAt: json['finishedAt'] == null
          ? null
          : DateTime.parse(json['finishedAt'] as String),
    );

Map<String, dynamic> _$AiWorkerRunDtoToJson(AiWorkerRunDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'roleId': instance.roleId,
      'roleName': instance.roleName,
      'status': instance.status.toJson(),
      'model': instance.model,
      'total': instance.total,
      'proposed': instance.proposed,
      'failed': instance.failed,
      'inFlight': instance.inFlight,
      'costCents': instance.costCents,
      'error': ?instance.error,
      'createdAt': instance.createdAt.toIso8601String(),
      'finishedAt': ?instance.finishedAt?.toIso8601String(),
    };
