// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskDto _$TaskDtoFromJson(Map<String, dynamic> json) => TaskDto(
  createdAt: json['createdAt'] as String,
  kind: AttorneyTaskKind.fromJson(json['kind'] as String),
  title: json['title'] as String,
  status: AttorneyTaskStatus.fromJson(json['status'] as String),
  files: (json['files'] as List<dynamic>)
      .map((e) => TaskFileDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  id: json['id'] as String,
  assignedToMe: json['assignedToMe'] as bool,
  repeat: TaskRepeat.fromJson(json['repeat'] as String),
  canEdit: json['canEdit'] as bool,
  people: (json['people'] as List<dynamic>)
      .map((e) => TaskPersonDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  places: (json['places'] as List<dynamic>)
      .map((e) => TaskPlaceDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  keepForever: json['keepForever'] as bool,
  canComplete: json['canComplete'] as bool,
  steps: (json['steps'] as List<dynamic>)
      .map((e) => TaskStepDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  priority: TaskPriority.fromJson(json['priority'] as String),
  canDelete: json['canDelete'] as bool,
  createdByName: json['createdByName'] as String?,
  rescheduledTo: json['rescheduledTo'] as String?,
  doneAt: json['doneAt'] as String?,
  outcomeNote: json['outcomeNote'] as String?,
  contactEmail: json['contactEmail'] as String?,
  contactPhone: json['contactPhone'] as String?,
  contactName: json['contactName'] as String?,
  caseTitle: json['caseTitle'] as String?,
  repeatUntil: json['repeatUntil'] as String?,
  remindBeforeMin: json['remindBeforeMin'] as num?,
  assigneeMembershipId: json['assigneeMembershipId'] as String?,
  assigneeName: json['assigneeName'] as String?,
  caseId: json['caseId'] as String?,
  conversationId: json['conversationId'] as String?,
  archivedAt: json['archivedAt'] as String?,
  dueAt: json['dueAt'] as String?,
  purgeAt: json['purgeAt'] as String?,
  notes: json['notes'] as String?,
  location: json['location'] as String?,
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
  'canDelete': instance.canDelete,
  'createdAt': instance.createdAt,
  'doneAt': ?instance.doneAt,
  'steps': instance.steps.map((e) => e.toJson()).toList(),
  'places': instance.places.map((e) => e.toJson()).toList(),
  'people': instance.people.map((e) => e.toJson()).toList(),
  'priority': instance.priority.toJson(),
  'repeat': instance.repeat.toJson(),
  'repeatUntil': ?instance.repeatUntil,
  'remindBeforeMin': ?instance.remindBeforeMin,
  'assigneeMembershipId': ?instance.assigneeMembershipId,
  'assigneeName': ?instance.assigneeName,
  'assignedToMe': instance.assignedToMe,
  'conversationId': ?instance.conversationId,
  'archivedAt': ?instance.archivedAt,
  'keepForever': instance.keepForever,
  'purgeAt': ?instance.purgeAt,
  'canComplete': instance.canComplete,
  'canEdit': instance.canEdit,
};
