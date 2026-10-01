// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_step_input_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskStepInputDto _$TaskStepInputDtoFromJson(Map<String, dynamic> json) =>
    TaskStepInputDto(
      title: json['title'] as String,
      kind: json['kind'] == null
          ? null
          : AttorneyTaskKind.fromJson(json['kind'] as String),
      dueAt: json['dueAt'] == null
          ? null
          : DateTime.parse(json['dueAt'] as String),
      location: json['location'] as String?,
      contactName: json['contactName'] as String?,
      contactPhone: json['contactPhone'] as String?,
      contactEmail: json['contactEmail'] as String?,
    );

Map<String, dynamic> _$TaskStepInputDtoToJson(TaskStepInputDto instance) =>
    <String, dynamic>{
      'kind': ?instance.kind?.toJson(),
      'title': instance.title,
      'dueAt': ?instance.dueAt?.toIso8601String(),
      'location': ?instance.location,
      'contactName': ?instance.contactName,
      'contactPhone': ?instance.contactPhone,
      'contactEmail': ?instance.contactEmail,
    };
