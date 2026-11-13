// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_ai_task_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateAiTaskDto _$CreateAiTaskDtoFromJson(Map<String, dynamic> json) =>
    CreateAiTaskDto(
      title: json['title'] as String,
      details: json['details'] as String,
      imageFileIds: (json['imageFileIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$CreateAiTaskDtoToJson(CreateAiTaskDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'details': instance.details,
      'imageFileIds': ?instance.imageFileIds,
    };
