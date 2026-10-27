// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'set_admin_workspace_dto_workspace.dart';

part 'set_admin_workspace_dto.g.dart';

@JsonSerializable()
class SetAdminWorkspaceDto {
  const SetAdminWorkspaceDto({required this.workspace});

  factory SetAdminWorkspaceDto.fromJson(Map<String, Object?> json) =>
      _$SetAdminWorkspaceDtoFromJson(json);

  final SetAdminWorkspaceDtoWorkspace workspace;

  Map<String, Object?> toJson() => _$SetAdminWorkspaceDtoToJson(this);
}
