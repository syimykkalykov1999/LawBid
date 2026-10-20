// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_notice_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationNoticeDto _$ModerationNoticeDtoFromJson(Map<String, dynamic> json) =>
    ModerationNoticeDto(
      actionId: json['actionId'] as String,
      action: ModerationNoticeDtoAction.fromJson(json['action'] as String),
      targetType: ModerationNoticeDtoTargetType.fromJson(
        json['targetType'] as String,
      ),
      targetId: json['targetId'] as String,
      reason: json['reason'] as String?,
      excerpt: json['excerpt'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      canAppeal: json['canAppeal'] as bool,
      appealStatus: json['appealStatus'] == null
          ? null
          : ModerationNoticeDtoAppealStatus.fromJson(
              json['appealStatus'] as String,
            ),
      appealNote: json['appealNote'] as String?,
    );

Map<String, dynamic> _$ModerationNoticeDtoToJson(
  ModerationNoticeDto instance,
) => <String, dynamic>{
  'actionId': instance.actionId,
  'action': instance.action.toJson(),
  'targetType': instance.targetType.toJson(),
  'targetId': instance.targetId,
  'reason': ?instance.reason,
  'excerpt': ?instance.excerpt,
  'createdAt': instance.createdAt.toIso8601String(),
  'canAppeal': instance.canAppeal,
  'appealStatus': ?instance.appealStatus?.toJson(),
  'appealNote': ?instance.appealNote,
};
