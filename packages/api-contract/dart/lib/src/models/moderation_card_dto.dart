// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'moderation_author_dto.dart';
import 'moderation_card_dto_available_actions.dart';
import 'moderation_card_dto_target_type.dart';
import 'moderation_history_item_dto.dart';
import 'moderation_report_dto.dart';

part 'moderation_card_dto.g.dart';

@JsonSerializable()
class ModerationCardDto {
  const ModerationCardDto({
    required this.targetType,
    required this.targetId,
    required this.status,
    required this.text,
    required this.context,
    required this.createdAt,
    required this.author,
    required this.reports,
    required this.authorHistory,
    required this.availableActions,
  });

  factory ModerationCardDto.fromJson(Map<String, Object?> json) =>
      _$ModerationCardDtoFromJson(json);

  final ModerationCardDtoTargetType targetType;
  final String targetId;
  final String? status;

  /// Full text / title+description; null for a user.
  final String? text;

  /// postId, conversationId, attorneyId …
  final dynamic context;
  final DateTime? createdAt;
  final ModerationAuthorDto? author;
  final List<ModerationReportDto> reports;

  /// Author's past sanctions and content actions.
  final List<ModerationHistoryItemDto> authorHistory;

  /// Actions that apply to this object now.
  final List<ModerationCardDtoAvailableActions> availableActions;

  Map<String, Object?> toJson() => _$ModerationCardDtoToJson(this);
}
