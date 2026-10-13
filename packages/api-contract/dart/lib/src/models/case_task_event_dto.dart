// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_task_event_dto_actor_role.dart';
import 'case_task_event_dto_type.dart';

part 'case_task_event_dto.g.dart';

@JsonSerializable()
class CaseTaskEventDto {
  const CaseTaskEventDto({
    required this.id,
    required this.type,
    required this.actorRole,
    required this.fileCount,
    required this.at,
    this.note,
  });

  factory CaseTaskEventDto.fromJson(Map<String, Object?> json) =>
      _$CaseTaskEventDtoFromJson(json);

  final String id;
  final CaseTaskEventDtoType type;
  final CaseTaskEventDtoActorRole actorRole;
  final String? note;
  final int fileCount;
  final String at;

  Map<String, Object?> toJson() => _$CaseTaskEventDtoToJson(this);
}
