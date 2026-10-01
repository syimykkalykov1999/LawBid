// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_step_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskStepDto _$TaskStepDtoFromJson(Map<String, dynamic> json) => TaskStepDto(
  id: json['id'] as String,
  position: json['position'] as num,
  title: json['title'] as String,
  status: AttorneyTaskStatus.fromJson(json['status'] as String),
  kind: json['kind'] == null
      ? null
      : AttorneyTaskKind.fromJson(json['kind'] as String),
  dueAt: json['dueAt'] as String?,
  location: json['location'] as String?,
  contactName: json['contactName'] as String?,
  contactPhone: json['contactPhone'] as String?,
  contactEmail: json['contactEmail'] as String?,
  note: json['note'] as String?,
  doneAt: json['doneAt'] as String?,
  createdByName: json['createdByName'] as String?,
);

Map<String, dynamic> _$TaskStepDtoToJson(TaskStepDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'position': instance.position,
      'kind': ?instance.kind?.toJson(),
      'title': instance.title,
      'dueAt': ?instance.dueAt,
      'location': ?instance.location,
      'contactName': ?instance.contactName,
      'contactPhone': ?instance.contactPhone,
      'contactEmail': ?instance.contactEmail,
      'status': instance.status.toJson(),
      'note': ?instance.note,
      'doneAt': ?instance.doneAt,
      'createdByName': ?instance.createdByName,
    };
