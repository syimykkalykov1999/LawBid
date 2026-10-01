// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskDto _$TaskDtoFromJson(Map<String, dynamic> json) => TaskDto(
  id: json['id'] as String,
  kind: AttorneyTaskKind.fromJson(json['kind'] as String),
  title: json['title'] as String,
  files: (json['files'] as List<dynamic>)
      .map((e) => TaskFileDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  status: AttorneyTaskStatus.fromJson(json['status'] as String),
  createdAt: json['createdAt'] as String,
  notes: json['notes'] as String?,
  dueAt: json['dueAt'] as String?,
  location: json['location'] as String?,
  caseId: json['caseId'] as String?,
  caseTitle: json['caseTitle'] as String?,
  contactName: json['contactName'] as String?,
  contactPhone: json['contactPhone'] as String?,
  contactEmail: json['contactEmail'] as String?,
  outcomeNote: json['outcomeNote'] as String?,
  rescheduledTo: json['rescheduledTo'] as String?,
  createdByName: json['createdByName'] as String?,
  doneAt: json['doneAt'] as String?,
);

Map<String, dynamic> _$TaskDtoToJson(TaskDto instance) => <String, dynamic>{
  'id': instance.id,
  'kind': instance.kind.toJson(),
  'title': instance.title,
  'notes': ?instance.notes,
  'dueAt': ?instance.dueAt,
  'location': ?instance.location,
  'caseId': ?instance.caseId,
  'caseTitle': ?instance.caseTitle,
  'contactName': ?instance.contactName,
  'contactPhone': ?instance.contactPhone,
  'contactEmail': ?instance.contactEmail,
  'files': instance.files.map((e) => e.toJson()).toList(),
  'status': instance.status.toJson(),
  'outcomeNote': ?instance.outcomeNote,
  'rescheduledTo': ?instance.rescheduledTo,
  'createdByName': ?instance.createdByName,
  'createdAt': instance.createdAt,
  'doneAt': ?instance.doneAt,
};
