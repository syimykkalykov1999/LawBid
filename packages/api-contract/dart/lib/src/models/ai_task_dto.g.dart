// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_task_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiTaskDto _$AiTaskDtoFromJson(Map<String, dynamic> json) => AiTaskDto(
  number: json['number'] as num,
  title: json['title'] as String,
  state: AiTaskDtoState.fromJson(json['state'] as String),
  url: json['url'] as String,
  createdAt: DateTime.parse(json['createdAt'] as String),
  pulls: (json['pulls'] as List<dynamic>)
      .map((e) => AiTaskPullDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AiTaskDtoToJson(AiTaskDto instance) => <String, dynamic>{
  'number': instance.number,
  'title': instance.title,
  'state': instance.state.toJson(),
  'url': instance.url,
  'createdAt': instance.createdAt.toIso8601String(),
  'pulls': instance.pulls.map((e) => e.toJson()).toList(),
};
