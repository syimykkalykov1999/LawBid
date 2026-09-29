// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_queue_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationQueueItemDto _$ModerationQueueItemDtoFromJson(
  Map<String, dynamic> json,
) => ModerationQueueItemDto(
  targetType: ModerationQueueItemDtoTargetType.fromJson(
    json['targetType'] as String,
  ),
  targetId: json['targetId'] as String,
  reports: (json['reports'] as num).toInt(),
  reporters: (json['reporters'] as num).toInt(),
  reasons: (json['reasons'] as List<dynamic>).map((e) => e as String).toList(),
  firstReportedAt: DateTime.parse(json['firstReportedAt'] as String),
  lastReportedAt: DateTime.parse(json['lastReportedAt'] as String),
  targetStatus: json['targetStatus'] as String?,
  excerpt: json['excerpt'] as String?,
  author: json['author'] == null
      ? null
      : ModerationAuthorDto.fromJson(json['author'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ModerationQueueItemDtoToJson(
  ModerationQueueItemDto instance,
) => <String, dynamic>{
  'targetType': instance.targetType.toJson(),
  'targetId': instance.targetId,
  'reports': instance.reports,
  'reporters': instance.reporters,
  'reasons': instance.reasons,
  'firstReportedAt': instance.firstReportedAt.toIso8601String(),
  'lastReportedAt': instance.lastReportedAt.toIso8601String(),
  'targetStatus': ?instance.targetStatus,
  'excerpt': ?instance.excerpt,
  'author': ?instance.author?.toJson(),
};
