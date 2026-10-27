// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_admin_workspace_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetAdminWorkspaceDto _$SetAdminWorkspaceDtoFromJson(
  Map<String, dynamic> json,
) => SetAdminWorkspaceDto(
  workspace: SetAdminWorkspaceDtoWorkspace.fromJson(
    json['workspace'] as String,
  ),
);

Map<String, dynamic> _$SetAdminWorkspaceDtoToJson(
  SetAdminWorkspaceDto instance,
) => <String, dynamic>{'workspace': instance.workspace.toJson()};
