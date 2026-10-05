// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_case_urgency_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateCaseUrgencyDto _$UpdateCaseUrgencyDtoFromJson(
  Map<String, dynamic> json,
) => UpdateCaseUrgencyDto(
  urgency: json['urgency'] == null
      ? null
      : CaseUrgency.fromJson(json['urgency'] as String),
  deadlineAt: json['deadlineAt'] == null
      ? null
      : DateTime.parse(json['deadlineAt'] as String),
  deadlineKind: json['deadlineKind'] == null
      ? null
      : CaseDeadlineKind.fromJson(json['deadlineKind'] as String),
);

Map<String, dynamic> _$UpdateCaseUrgencyDtoToJson(
  UpdateCaseUrgencyDto instance,
) => <String, dynamic>{
  'urgency': ?instance.urgency?.toJson(),
  'deadlineAt': ?instance.deadlineAt?.toIso8601String(),
  'deadlineKind': ?instance.deadlineKind?.toJson(),
};
