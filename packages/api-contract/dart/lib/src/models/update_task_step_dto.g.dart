// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_task_step_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateTaskStepDto _$UpdateTaskStepDtoFromJson(Map<String, dynamic> json) =>
    UpdateTaskStepDto(
      status: json['status'] == null
          ? null
          : TaskStepStatus.fromJson(json['status'] as String),
      note: json['note'] as String?,
      dueAt: json['dueAt'] == null
          ? null
          : DateTime.parse(json['dueAt'] as String),
    );

Map<String, dynamic> _$UpdateTaskStepDtoToJson(UpdateTaskStepDto instance) =>
    <String, dynamic>{
      'status': ?instance.status?.toJson(),
      'note': ?instance.note,
      'dueAt': ?instance.dueAt?.toIso8601String(),
    };
