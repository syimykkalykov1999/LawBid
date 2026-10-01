// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_task_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateTaskStatusDto _$UpdateTaskStatusDtoFromJson(Map<String, dynamic> json) =>
    UpdateTaskStatusDto(
      status: UpdateTaskStatusDtoStatus.fromJson(json['status'] as String),
      outcomeNote: json['outcomeNote'] as String?,
      rescheduleTo: json['rescheduleTo'] == null
          ? null
          : DateTime.parse(json['rescheduleTo'] as String),
    );

Map<String, dynamic> _$UpdateTaskStatusDtoToJson(
  UpdateTaskStatusDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'outcomeNote': ?instance.outcomeNote,
  'rescheduleTo': ?instance.rescheduleTo?.toIso8601String(),
};
