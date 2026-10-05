// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bulk_tasks_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BulkTasksDto _$BulkTasksDtoFromJson(Map<String, dynamic> json) => BulkTasksDto(
  ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
  action: TaskBulkAction.fromJson(json['action'] as String),
  status: json['status'] == null
      ? null
      : BulkTasksDtoStatus.fromJson(json['status'] as String),
  priority: json['priority'] == null
      ? null
      : TaskPriority.fromJson(json['priority'] as String),
  assigneeMembershipId: json['assigneeMembershipId'] as String?,
);

Map<String, dynamic> _$BulkTasksDtoToJson(BulkTasksDto instance) =>
    <String, dynamic>{
      'ids': instance.ids,
      'action': instance.action.toJson(),
      'status': ?instance.status?.toJson(),
      'priority': ?instance.priority?.toJson(),
      'assigneeMembershipId': ?instance.assigneeMembershipId,
    };
