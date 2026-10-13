// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'workspace_file_dto.dart';

part 'workspace_file_list_envelope.g.dart';

@JsonSerializable()
class WorkspaceFileListEnvelope {
  const WorkspaceFileListEnvelope({required this.data, this.meta});

  factory WorkspaceFileListEnvelope.fromJson(Map<String, Object?> json) =>
      _$WorkspaceFileListEnvelopeFromJson(json);

  final List<WorkspaceFileDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$WorkspaceFileListEnvelopeToJson(this);
}
