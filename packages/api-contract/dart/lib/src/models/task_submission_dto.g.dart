// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_submission_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskSubmissionDto _$TaskSubmissionDtoFromJson(Map<String, dynamic> json) =>
    TaskSubmissionDto(
      files: (json['files'] as List<dynamic>)
          .map((e) => CaseFileInputDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      itemId: json['itemId'] as String?,
      note: json['note'] as String?,
    );

Map<String, dynamic> _$TaskSubmissionDtoToJson(TaskSubmissionDto instance) =>
    <String, dynamic>{
      'itemId': ?instance.itemId,
      'note': ?instance.note,
      'files': instance.files.map((e) => e.toJson()).toList(),
    };
