// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_activity_dto_actor_role.dart';
import 'case_activity_dto_kind.dart';

part 'case_activity_dto.g.dart';

@JsonSerializable()
class CaseActivityDto {
  const CaseActivityDto({
    required this.id,
    required this.kind,
    required this.actorRole,
    required this.actorName,
    required this.fileCount,
    required this.at,
    this.text,
    this.taskTitle,
  });

  factory CaseActivityDto.fromJson(Map<String, Object?> json) =>
      _$CaseActivityDtoFromJson(json);

  final String id;
  final CaseActivityDtoKind kind;
  final CaseActivityDtoActorRole actorRole;
  final String actorName;
  final String? text;
  final String? taskTitle;
  final int fileCount;
  final String at;

  Map<String, Object?> toJson() => _$CaseActivityDtoToJson(this);
}
