// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'moderation_history_item_dto.g.dart';

@JsonSerializable()
class ModerationHistoryItemDto {
  const ModerationHistoryItemDto({
    required this.id,
    required this.action,
    required this.targetType,
    required this.targetId,
    required this.reason,
    required this.createdAt,
  });

  factory ModerationHistoryItemDto.fromJson(Map<String, Object?> json) =>
      _$ModerationHistoryItemDtoFromJson(json);

  final String id;
  final String action;
  final String targetType;
  final String targetId;
  final String? reason;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$ModerationHistoryItemDtoToJson(this);
}
