// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_workspace_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseWorkspaceDto _$CaseWorkspaceDtoFromJson(Map<String, dynamic> json) =>
    CaseWorkspaceDto(
      role: CaseWorkspaceDtoRole.fromJson(json['role'] as String),
      files: (json['files'] as List<dynamic>)
          .map((e) => WorkspaceFileDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      openTasks: (json['openTasks'] as num).toInt(),
      updatesCount: (json['updatesCount'] as num).toInt(),
      newUpdates: (json['newUpdates'] as num).toInt(),
    );

Map<String, dynamic> _$CaseWorkspaceDtoToJson(CaseWorkspaceDto instance) =>
    <String, dynamic>{
      'role': instance.role.toJson(),
      'files': instance.files.map((e) => e.toJson()).toList(),
      'openTasks': instance.openTasks,
      'updatesCount': instance.updatesCount,
      'newUpdates': instance.newUpdates,
    };
