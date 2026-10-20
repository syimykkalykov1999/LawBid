// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'running_timer_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RunningTimerDto _$RunningTimerDtoFromJson(Map<String, dynamic> json) =>
    RunningTimerDto(
      entryId: json['entryId'] as String,
      caseId: json['caseId'] as String,
      caseTitle: json['caseTitle'] as String,
      startedAt: DateTime.parse(json['startedAt'] as String),
    );

Map<String, dynamic> _$RunningTimerDtoToJson(RunningTimerDto instance) =>
    <String, dynamic>{
      'entryId': instance.entryId,
      'caseId': instance.caseId,
      'caseTitle': instance.caseTitle,
      'startedAt': instance.startedAt.toIso8601String(),
    };
