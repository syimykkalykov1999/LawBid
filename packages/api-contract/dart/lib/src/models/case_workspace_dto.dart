// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_workspace_dto_role.dart';
import 'workspace_file_dto.dart';

part 'case_workspace_dto.g.dart';

@JsonSerializable()
class CaseWorkspaceDto {
  const CaseWorkspaceDto({
    required this.role,
    required this.files,
    required this.openTasks,
    required this.updatesCount,
    required this.newUpdates,
  });

  factory CaseWorkspaceDto.fromJson(Map<String, Object?> json) =>
      _$CaseWorkspaceDtoFromJson(json);

  final CaseWorkspaceDtoRole role;
  final List<WorkspaceFileDto> files;
  final int openTasks;
  final int updatesCount;

  /// The other side's updates since this side last opened Updates.
  final int newUpdates;

  Map<String, Object?> toJson() => _$CaseWorkspaceDtoToJson(this);
}
