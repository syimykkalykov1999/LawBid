// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_task_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateTaskDto _$CreateTaskDtoFromJson(Map<String, dynamic> json) =>
    CreateTaskDto(
      kind: AttorneyTaskKind.fromJson(json['kind'] as String),
      title: json['title'] as String,
      places: (json['places'] as List<dynamic>?)
          ?.map((e) => TaskPlaceInputDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      people: (json['people'] as List<dynamic>?)
          ?.map((e) => TaskPersonInputDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      priority: json['priority'] == null
          ? null
          : TaskPriority.fromJson(json['priority'] as String),
      repeat: json['repeat'] == null
          ? null
          : TaskRepeat.fromJson(json['repeat'] as String),
      repeatUntil: json['repeatUntil'] == null
          ? null
          : DateTime.parse(json['repeatUntil'] as String),
      remindBeforeMin: json['remindBeforeMin'] as num?,
      assigneeMembershipId: json['assigneeMembershipId'] as String?,
      conversationId: json['conversationId'] as String?,
      keepForever: json['keepForever'] as bool?,
      notes: json['notes'] as String?,
      dueAt: json['dueAt'] == null
          ? null
          : DateTime.parse(json['dueAt'] as String),
      location: json['location'] as String?,
      caseId: json['caseId'] as String?,
      contactName: json['contactName'] as String?,
      contactPhone: json['contactPhone'] as String?,
      contactEmail: json['contactEmail'] as String?,
      fileIds: (json['fileIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      steps: (json['steps'] as List<dynamic>?)
          ?.map((e) => TaskStepInputDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$CreateTaskDtoToJson(CreateTaskDto instance) =>
    <String, dynamic>{
      'places': ?instance.places?.map((e) => e.toJson()).toList(),
      'people': ?instance.people?.map((e) => e.toJson()).toList(),
      'priority': ?instance.priority?.toJson(),
      'repeat': ?instance.repeat?.toJson(),
      'repeatUntil': ?instance.repeatUntil?.toIso8601String(),
      'remindBeforeMin': ?instance.remindBeforeMin,
      'assigneeMembershipId': ?instance.assigneeMembershipId,
      'conversationId': ?instance.conversationId,
      'keepForever': ?instance.keepForever,
      'kind': instance.kind.toJson(),
      'title': instance.title,
      'notes': ?instance.notes,
      'dueAt': ?instance.dueAt?.toIso8601String(),
      'location': ?instance.location,
      'caseId': ?instance.caseId,
      'contactName': ?instance.contactName,
      'contactPhone': ?instance.contactPhone,
      'contactEmail': ?instance.contactEmail,
      'fileIds': ?instance.fileIds,
      'steps': ?instance.steps?.map((e) => e.toJson()).toList(),
    };
