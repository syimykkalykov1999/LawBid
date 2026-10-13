// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_update_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseUpdateDto _$CaseUpdateDtoFromJson(Map<String, dynamic> json) =>
    CaseUpdateDto(
      id: json['id'] as String,
      authorRole: CaseUpdateDtoAuthorRole.fromJson(
        json['authorRole'] as String,
      ),
      authorName: json['authorName'] as String,
      authorStates: (json['authorStates'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      body: json['body'] as String,
      files: (json['files'] as List<dynamic>)
          .map((e) => WorkspaceFileDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      at: json['at'] as String,
      kind: CaseUpdateDtoKind.fromJson(json['kind'] as String),
      authorAvatarUrl: json['authorAvatarUrl'] as String?,
      taskTitle: json['taskTitle'] as String?,
    );

Map<String, dynamic> _$CaseUpdateDtoToJson(CaseUpdateDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'authorRole': instance.authorRole.toJson(),
      'authorName': instance.authorName,
      'authorAvatarUrl': ?instance.authorAvatarUrl,
      'authorStates': instance.authorStates,
      'body': instance.body,
      'files': instance.files.map((e) => e.toJson()).toList(),
      'at': instance.at,
      'kind': instance.kind.toJson(),
      'taskTitle': ?instance.taskTitle,
    };
