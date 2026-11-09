// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ai_task_pull_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AiTaskPullDto _$AiTaskPullDtoFromJson(Map<String, dynamic> json) =>
    AiTaskPullDto(
      number: json['number'] as num,
      url: json['url'] as String,
      state: AiTaskPullDtoState.fromJson(json['state'] as String),
      merged: json['merged'] as bool,
    );

Map<String, dynamic> _$AiTaskPullDtoToJson(AiTaskPullDto instance) =>
    <String, dynamic>{
      'number': instance.number,
      'url': instance.url,
      'state': instance.state.toJson(),
      'merged': instance.merged,
    };
