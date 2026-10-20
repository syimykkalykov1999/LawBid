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
    required this.publishedAt,
    required this.bidsCount,
    required this.newUpdates,
    required this.canWrite,
    this.acceptedAt,
  });

  factory CaseWorkspaceDto.fromJson(Map<String, Object?> json) =>
      _$CaseWorkspaceDtoFromJson(json);

  final CaseWorkspaceDtoRole role;
  final List<WorkspaceFileDto> files;
  final int openTasks;
  final int updatesCount;
  final String publishedAt;
  final String? acceptedAt;
  final int bidsCount;

  /// The other side's updates since this side last opened Updates.
  final int newUpdates;

  /// Audit 2026-10-19: false once the case is closed — the workspace is then read-only (no new updates, files or tasks).
  final bool canWrite;

  Map<String, Object?> toJson() => _$CaseWorkspaceDtoToJson(this);
}
