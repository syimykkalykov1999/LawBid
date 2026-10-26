// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'workspace_queue_dto_key.dart';

part 'workspace_queue_dto.g.dart';

@JsonSerializable()
class WorkspaceQueueDto {
  const WorkspaceQueueDto({
    required this.key,
    required this.label,
    required this.unit,
    required this.count,
    required this.urgent,
    required this.href,
    required this.focus,
    required this.canAct,
  });

  factory WorkspaceQueueDto.fromJson(Map<String, Object?> json) =>
      _$WorkspaceQueueDtoFromJson(json);

  final WorkspaceQueueDtoKey key;
  final String label;

  /// What one item is, e.g. «заявок».
  final String unit;

  /// Items waiting now.
  final num count;

  /// Waiting too long (over the SLA or 24 h).
  final num urgent;

  /// The panel page with the full list.
  final String href;

  /// The workspace can open items one by one («Начать»).
  final bool focus;

  /// The admin may decide here (not only look).
  final bool canAct;

  Map<String, Object?> toJson() => _$WorkspaceQueueDtoToJson(this);
}
