// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'moderation_action_dto_action.dart';

part 'moderation_action_dto.g.dart';

@JsonSerializable()
class ModerationActionDto {
  const ModerationActionDto({required this.action, required this.reason});

  factory ModerationActionDto.fromJson(Map<String, Object?> json) =>
      _$ModerationActionDtoFromJson(json);

  final ModerationActionDtoAction action;

  /// Required for every action (§3.2).
  final String reason;

  Map<String, Object?> toJson() => _$ModerationActionDtoToJson(this);
}
