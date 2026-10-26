// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_task_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseTaskItemDto _$CaseTaskItemDtoFromJson(Map<String, dynamic> json) =>
    CaseTaskItemDto(
      id: json['id'] as String,
      title: json['title'] as String,
      done: json['done'] as bool,
      files: (json['files'] as List<dynamic>)
          .map((e) => WorkspaceFileDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      doneAt: json['doneAt'] as String?,
    );

Map<String, dynamic> _$CaseTaskItemDtoToJson(CaseTaskItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'done': instance.done,
      'doneAt': ?instance.doneAt,
      'files': instance.files.map((e) => e.toJson()).toList(),
    };
