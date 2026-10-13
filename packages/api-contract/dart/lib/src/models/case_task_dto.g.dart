// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_task_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseTaskDto _$CaseTaskDtoFromJson(Map<String, dynamic> json) => CaseTaskDto(
  id: json['id'] as String,
  kind: CaseTaskDtoKind.fromJson(json['kind'] as String),
  title: json['title'] as String,
  status: CaseTaskDtoStatus.fromJson(json['status'] as String),
  closed: json['closed'] as bool,
  createdAt: json['createdAt'] as String,
  fileCount: (json['fileCount'] as num).toInt(),
  files: (json['files'] as List<dynamic>)
      .map((e) => WorkspaceFileDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  events: (json['events'] as List<dynamic>)
      .map((e) => CaseTaskEventDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  items: (json['items'] as List<dynamic>)
      .map((e) => CaseTaskItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  itemsDone: (json['itemsDone'] as num).toInt(),
  itemsTotal: (json['itemsTotal'] as num).toInt(),
  description: json['description'] as String?,
  doneAt: json['doneAt'] as String?,
  closedAt: json['closedAt'] as String?,
);

Map<String, dynamic> _$CaseTaskDtoToJson(CaseTaskDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'kind': instance.kind.toJson(),
      'title': instance.title,
      'description': ?instance.description,
      'status': instance.status.toJson(),
      'doneAt': ?instance.doneAt,
      'closed': instance.closed,
      'closedAt': ?instance.closedAt,
      'createdAt': instance.createdAt,
      'fileCount': instance.fileCount,
      'files': instance.files.map((e) => e.toJson()).toList(),
      'events': instance.events.map((e) => e.toJson()).toList(),
      'items': instance.items.map((e) => e.toJson()).toList(),
      'itemsDone': instance.itemsDone,
      'itemsTotal': instance.itemsTotal,
    };
