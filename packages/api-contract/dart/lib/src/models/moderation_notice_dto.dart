// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'moderation_notice_dto_action.dart';
import 'moderation_notice_dto_appeal_status.dart';
import 'moderation_notice_dto_target_type.dart';

part 'moderation_notice_dto.g.dart';

@JsonSerializable()
class ModerationNoticeDto {
  const ModerationNoticeDto({
    required this.actionId,
    required this.action,
    required this.targetType,
    required this.targetId,
    required this.reason,
    required this.excerpt,
    required this.createdAt,
    required this.canAppeal,
    required this.appealStatus,
    required this.appealNote,
  });

  factory ModerationNoticeDto.fromJson(Map<String, Object?> json) =>
      _$ModerationNoticeDtoFromJson(json);

  /// moderation_actions.id
  final String actionId;
  final ModerationNoticeDtoAction action;
  final ModerationNoticeDtoTargetType targetType;
  final String targetId;
  final String? reason;

  /// Text excerpt.
  final String? excerpt;
  final DateTime createdAt;

  /// hide / remove of content that is still hidden, within 30 days, not yet appealed.
  final bool canAppeal;
  final ModerationNoticeDtoAppealStatus? appealStatus;
  final String? appealNote;

  Map<String, Object?> toJson() => _$ModerationNoticeDtoToJson(this);
}
