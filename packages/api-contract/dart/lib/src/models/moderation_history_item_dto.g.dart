// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_history_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationHistoryItemDto _$ModerationHistoryItemDtoFromJson(
  Map<String, dynamic> json,
) => ModerationHistoryItemDto(
  id: json['id'] as String,
  action: json['action'] as String,
  targetType: json['targetType'] as String,
  targetId: json['targetId'] as String,
  reason: json['reason'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$ModerationHistoryItemDtoToJson(
  ModerationHistoryItemDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'action': instance.action,
  'targetType': instance.targetType,
  'targetId': instance.targetId,
  'reason': ?instance.reason,
  'createdAt': instance.createdAt.toIso8601String(),
};
