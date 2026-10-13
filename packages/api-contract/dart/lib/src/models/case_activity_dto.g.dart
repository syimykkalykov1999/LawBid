// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_activity_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseActivityDto _$CaseActivityDtoFromJson(Map<String, dynamic> json) =>
    CaseActivityDto(
      id: json['id'] as String,
      kind: CaseActivityDtoKind.fromJson(json['kind'] as String),
      actorRole: CaseActivityDtoActorRole.fromJson(json['actorRole'] as String),
      actorName: json['actorName'] as String,
      fileCount: (json['fileCount'] as num).toInt(),
      at: json['at'] as String,
      text: json['text'] as String?,
      taskTitle: json['taskTitle'] as String?,
    );

Map<String, dynamic> _$CaseActivityDtoToJson(CaseActivityDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'kind': instance.kind.toJson(),
      'actorRole': instance.actorRole.toJson(),
      'actorName': instance.actorName,
      'text': ?instance.text,
      'taskTitle': ?instance.taskTitle,
      'fileCount': instance.fileCount,
      'at': instance.at,
    };
