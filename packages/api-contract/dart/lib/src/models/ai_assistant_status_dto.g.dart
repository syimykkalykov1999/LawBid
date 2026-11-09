// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_assistant_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiAssistantStatusDto _$AiAssistantStatusDtoFromJson(
  Map<String, dynamic> json,
) => AiAssistantStatusDto(
  mode: json['mode'] as String,
  connected: json['connected'] as bool,
  allowed: json['allowed'] as bool,
  reason: json['reason'] as String?,
  monthUsd: json['monthUsd'] as num,
  maxUsd: json['maxUsd'] as num,
  tasks: (json['tasks'] as List<dynamic>)
      .map((e) => AiTaskDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  tasksError: json['tasksError'] as String?,
  runs: (json['runs'] as List<dynamic>)
      .map((e) => AiRunDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AiAssistantStatusDtoToJson(
  AiAssistantStatusDto instance,
) => <String, dynamic>{
  'mode': instance.mode,
  'connected': instance.connected,
  'allowed': instance.allowed,
  'reason': ?instance.reason,
  'monthUsd': instance.monthUsd,
  'maxUsd': instance.maxUsd,
  'tasks': instance.tasks.map((e) => e.toJson()).toList(),
  'tasksError': ?instance.tasksError,
  'runs': instance.runs.map((e) => e.toJson()).toList(),
};
