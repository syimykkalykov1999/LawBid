// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'moderation_action_result_dto_action.dart';
import 'moderation_action_result_dto_target_type.dart';

part 'moderation_action_result_dto.g.dart';

@JsonSerializable()
class ModerationActionResultDto {
  const ModerationActionResultDto({
    required this.targetType,
    required this.targetId,
    required this.action,
    required this.status,
    required this.reportsHandled,
  });

  factory ModerationActionResultDto.fromJson(Map<String, Object?> json) =>
      _$ModerationActionResultDtoFromJson(json);

  final ModerationActionResultDtoTargetType targetType;
  final String targetId;
  final ModerationActionResultDtoAction action;
  final String? status;

  /// Open reports closed by this action.
  final int reportsHandled;

  Map<String, Object?> toJson() => _$ModerationActionResultDtoToJson(this);
}
