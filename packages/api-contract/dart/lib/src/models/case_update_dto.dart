// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_update_dto_author_role.dart';
import 'case_update_dto_kind.dart';
import 'workspace_file_dto.dart';

part 'case_update_dto.g.dart';

@JsonSerializable()
class CaseUpdateDto {
  const CaseUpdateDto({
    required this.id,
    required this.authorRole,
    required this.authorName,
    required this.authorStates,
    required this.body,
    required this.files,
    required this.at,
    required this.kind,
    this.authorAvatarUrl,
    this.taskTitle,
  });

  factory CaseUpdateDto.fromJson(Map<String, Object?> json) =>
      _$CaseUpdateDtoFromJson(json);

  final String id;
  final CaseUpdateDtoAuthorRole authorRole;
  final String authorName;
  final String? authorAvatarUrl;

  /// The attorney's verified license states (the role line).
  final List<String> authorStates;
  final String body;
  final List<WorkspaceFileDto> files;
  final String at;

  /// Done tasks and file additions are entries of the feed too.
  final CaseUpdateDtoKind kind;
  final String? taskTitle;

  Map<String, Object?> toJson() => _$CaseUpdateDtoToJson(this);
}
