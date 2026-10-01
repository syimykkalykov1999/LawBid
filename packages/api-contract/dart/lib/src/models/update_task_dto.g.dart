// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_task_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateTaskDto _$UpdateTaskDtoFromJson(Map<String, dynamic> json) =>
    UpdateTaskDto(
      kind: json['kind'] == null
          ? null
          : AttorneyTaskKind.fromJson(json['kind'] as String),
      title: json['title'] as String?,
      notes: json['notes'] as String?,
      dueAt: json['dueAt'] == null
          ? null
          : DateTime.parse(json['dueAt'] as String),
      clearDueAt: json['clearDueAt'] as bool?,
      caseId: json['caseId'] as String?,
      clearCaseId: json['clearCaseId'] as bool?,
      location: json['location'] as String?,
      contactName: json['contactName'] as String?,
      contactPhone: json['contactPhone'] as String?,
      contactEmail: json['contactEmail'] as String?,
      fileIds: (json['fileIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$UpdateTaskDtoToJson(UpdateTaskDto instance) =>
    <String, dynamic>{
      'kind': ?instance.kind?.toJson(),
      'title': ?instance.title,
      'notes': ?instance.notes,
      'dueAt': ?instance.dueAt?.toIso8601String(),
      'clearDueAt': ?instance.clearDueAt,
      'caseId': ?instance.caseId,
      'clearCaseId': ?instance.clearCaseId,
      'location': ?instance.location,
      'contactName': ?instance.contactName,
      'contactPhone': ?instance.contactPhone,
      'contactEmail': ?instance.contactEmail,
      'fileIds': ?instance.fileIds,
    };
