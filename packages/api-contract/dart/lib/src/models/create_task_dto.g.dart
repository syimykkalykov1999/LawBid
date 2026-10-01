// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_task_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateTaskDto _$CreateTaskDtoFromJson(Map<String, dynamic> json) =>
    CreateTaskDto(
      kind: AttorneyTaskKind.fromJson(json['kind'] as String),
      title: json['title'] as String,
      notes: json['notes'] as String?,
      dueAt: json['dueAt'] == null
          ? null
          : DateTime.parse(json['dueAt'] as String),
      location: json['location'] as String?,
      caseId: json['caseId'] as String?,
      contactName: json['contactName'] as String?,
      contactPhone: json['contactPhone'] as String?,
      fileIds: (json['fileIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$CreateTaskDtoToJson(CreateTaskDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'title': instance.title,
      'notes': ?instance.notes,
      'dueAt': ?instance.dueAt?.toIso8601String(),
      'location': ?instance.location,
      'caseId': ?instance.caseId,
      'contactName': ?instance.contactName,
      'contactPhone': ?instance.contactPhone,
      'fileIds': ?instance.fileIds,
    };
