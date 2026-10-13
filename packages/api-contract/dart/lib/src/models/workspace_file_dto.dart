// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'workspace_file_dto_added_by_role.dart';
import 'workspace_file_dto_source.dart';

part 'workspace_file_dto.g.dart';

@JsonSerializable()
class WorkspaceFileDto {
  const WorkspaceFileDto({
    required this.fileId,
    required this.url,
    required this.previewUrl,
    required this.mime,
    required this.sizeBytes,
    required this.source,
    required this.addedByRole,
    required this.addedAt,
    this.description,
    this.sourceTitle,
    this.sourceId,
  });

  factory WorkspaceFileDto.fromJson(Map<String, Object?> json) =>
      _$WorkspaceFileDtoFromJson(json);

  final String fileId;
  final String url;
  final String previewUrl;
  final String mime;
  final int sizeBytes;
  final String? description;
  final WorkspaceFileDtoSource source;
  final String? sourceTitle;
  final String? sourceId;
  final WorkspaceFileDtoAddedByRole addedByRole;
  final String addedAt;

  Map<String, Object?> toJson() => _$WorkspaceFileDtoToJson(this);
}
