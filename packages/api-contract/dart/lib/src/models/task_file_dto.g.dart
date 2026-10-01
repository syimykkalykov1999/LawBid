// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_file_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskFileDto _$TaskFileDtoFromJson(Map<String, dynamic> json) => TaskFileDto(
  fileId: json['fileId'] as String,
  url: json['url'] as String?,
  mime: json['mime'] as String?,
);

Map<String, dynamic> _$TaskFileDtoToJson(TaskFileDto instance) =>
    <String, dynamic>{
      'fileId': instance.fileId,
      'url': ?instance.url,
      'mime': ?instance.mime,
    };
