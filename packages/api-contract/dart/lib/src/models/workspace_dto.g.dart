// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

WorkspaceDto _$WorkspaceDtoFromJson(Map<String, dynamic> json) => WorkspaceDto(
  queues: (json['queues'] as List<dynamic>)
      .map((e) => WorkspaceQueueDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  shift: json['shift'] == null
      ? null
      : SupportAgentDto.fromJson(json['shift'] as Map<String, dynamic>),
);

Map<String, dynamic> _$WorkspaceDtoToJson(WorkspaceDto instance) =>
    <String, dynamic>{
      'queues': instance.queues.map((e) => e.toJson()).toList(),
      'shift': ?instance.shift?.toJson(),
    };
