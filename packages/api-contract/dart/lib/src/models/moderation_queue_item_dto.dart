// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'moderation_author_dto.dart';
import 'moderation_queue_item_dto_target_type.dart';

part 'moderation_queue_item_dto.g.dart';

@JsonSerializable()
class ModerationQueueItemDto {
  const ModerationQueueItemDto({
    required this.targetType,
    required this.targetId,
    required this.reports,
    required this.reporters,
    required this.reasons,
    required this.firstReportedAt,
    required this.lastReportedAt,
    required this.targetStatus,
    required this.excerpt,
    required this.author,
  });

  factory ModerationQueueItemDto.fromJson(Map<String, Object?> json) =>
      _$ModerationQueueItemDtoFromJson(json);

  final ModerationQueueItemDtoTargetType targetType;
  final String targetId;
  final int reports;
  final int reporters;
  final List<String> reasons;
  final DateTime firstReportedAt;
  final DateTime lastReportedAt;

  /// Current object status (hidden = auto-hidden or moderated).
  final String? targetStatus;

  /// First 200 characters.
  final String? excerpt;
  final ModerationAuthorDto? author;

  Map<String, Object?> toJson() => _$ModerationQueueItemDtoToJson(this);
}
