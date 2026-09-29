// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationCardDto _$ModerationCardDtoFromJson(
  Map<String, dynamic> json,
) => ModerationCardDto(
  targetType: ModerationCardDtoTargetType.fromJson(
    json['targetType'] as String,
  ),
  targetId: json['targetId'] as String,
  status: json['status'] as String?,
  text: json['text'] as String?,
  context: json['context'],
  createdAt: json['createdAt'] == null
      ? null
      : DateTime.parse(json['createdAt'] as String),
  author: json['author'] == null
      ? null
      : ModerationAuthorDto.fromJson(json['author'] as Map<String, dynamic>),
  reports: (json['reports'] as List<dynamic>)
      .map((e) => ModerationReportDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  authorHistory: (json['authorHistory'] as List<dynamic>)
      .map((e) => ModerationHistoryItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  availableActions: (json['availableActions'] as List<dynamic>)
      .map((e) => ModerationCardDtoAvailableActions.fromJson(e as String))
      .toList(),
);

Map<String, dynamic> _$ModerationCardDtoToJson(
  ModerationCardDto instance,
) => <String, dynamic>{
  'targetType': instance.targetType.toJson(),
  'targetId': instance.targetId,
  'status': ?instance.status,
  'text': ?instance.text,
  'context': ?instance.context,
  'createdAt': ?instance.createdAt?.toIso8601String(),
  'author': ?instance.author?.toJson(),
  'reports': instance.reports.map((e) => e.toJson()).toList(),
  'authorHistory': instance.authorHistory.map((e) => e.toJson()).toList(),
  'availableActions': instance.availableActions.map((e) => e.toJson()).toList(),
};
