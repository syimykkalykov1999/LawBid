// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace_queue_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

WorkspaceQueueDto _$WorkspaceQueueDtoFromJson(Map<String, dynamic> json) =>
    WorkspaceQueueDto(
      key: WorkspaceQueueDtoKey.fromJson(json['key'] as String),
      label: json['label'] as String,
      unit: json['unit'] as String,
      count: json['count'] as num,
      urgent: json['urgent'] as num,
      href: json['href'] as String,
      focus: json['focus'] as bool,
      canAct: json['canAct'] as bool,
    );

Map<String, dynamic> _$WorkspaceQueueDtoToJson(WorkspaceQueueDto instance) =>
    <String, dynamic>{
      'key': instance.key.toJson(),
      'label': instance.label,
      'unit': instance.unit,
      'count': instance.count,
      'urgent': instance.urgent,
      'href': instance.href,
      'focus': instance.focus,
      'canAct': instance.canAct,
    };
