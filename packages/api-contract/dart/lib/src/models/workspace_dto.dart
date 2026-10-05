// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'support_agent_dto.dart';
import 'workspace_queue_dto.dart';

part 'workspace_dto.g.dart';

@JsonSerializable()
class WorkspaceDto {
  const WorkspaceDto({required this.queues, this.shift});

  factory WorkspaceDto.fromJson(Map<String, Object?> json) =>
      _$WorkspaceDtoFromJson(json);

  final List<WorkspaceQueueDto> queues;

  /// My support shift (support agents only).
  final SupportAgentDto? shift;

  Map<String, Object?> toJson() => _$WorkspaceDtoToJson(this);
}
