// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_case_task_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateCaseTaskDto _$CreateCaseTaskDtoFromJson(Map<String, dynamic> json) =>
    CreateCaseTaskDto(
      kind: CreateCaseTaskDtoKind.fromJson(json['kind'] as String),
      title: json['title'] as String,
      description: json['description'] as String?,
      items: (json['items'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      files: (json['files'] as List<dynamic>?)
          ?.map((e) => CaseFileInputDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$CreateCaseTaskDtoToJson(CreateCaseTaskDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'title': instance.title,
      'description': ?instance.description,
      'items': ?instance.items,
      'files': ?instance.files?.map((e) => e.toJson()).toList(),
    };
