// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'infra_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InfraRequestDto _$InfraRequestDtoFromJson(Map<String, dynamic> json) =>
    InfraRequestDto(
      id: json['id'] as String,
      itemId: json['itemId'] as String,
      itemName: json['itemName'] as String,
      fromState: json['fromState'] as String?,
      toState: json['toState'] as String,
      changes: json['changes'],
      status: InfraRequestDtoStatus.fromJson(json['status'] as String),
      costDeltaUsd: (json['costDeltaUsd'] as List<dynamic>)
          .map((e) => e as num)
          .toList(),
      dryRun: json['dryRun'] as bool,
      rollbackOf: json['rollbackOf'] as String?,
      plan: json['plan'] == null
          ? null
          : InfraPlanDto.fromJson(json['plan'] as Map<String, dynamic>),
      runUrl: json['runUrl'] as String?,
      recorded: json['recorded'] as String?,
      error: json['error'] as String?,
      impact: json['impact'] as String,
      createdAt: json['createdAt'] as String,
      plannedAt: json['plannedAt'] as String?,
      expiresAt: json['expiresAt'] as String?,
      finishedAt: json['finishedAt'] as String?,
    );

Map<String, dynamic> _$InfraRequestDtoToJson(InfraRequestDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'itemId': instance.itemId,
      'itemName': instance.itemName,
      'fromState': ?instance.fromState,
      'toState': instance.toState,
      'changes': ?instance.changes,
      'status': instance.status.toJson(),
      'costDeltaUsd': instance.costDeltaUsd,
      'dryRun': instance.dryRun,
      'rollbackOf': ?instance.rollbackOf,
      'plan': ?instance.plan?.toJson(),
      'runUrl': ?instance.runUrl,
      'recorded': ?instance.recorded,
      'error': ?instance.error,
      'impact': instance.impact,
      'createdAt': instance.createdAt,
      'plannedAt': ?instance.plannedAt,
      'expiresAt': ?instance.expiresAt,
      'finishedAt': ?instance.finishedAt,
    };
