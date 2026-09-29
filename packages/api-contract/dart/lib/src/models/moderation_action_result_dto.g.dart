// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_action_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationActionResultDto _$ModerationActionResultDtoFromJson(
  Map<String, dynamic> json,
) => ModerationActionResultDto(
  targetType: ModerationActionResultDtoTargetType.fromJson(
    json['targetType'] as String,
  ),
  targetId: json['targetId'] as String,
  action: ModerationActionResultDtoAction.fromJson(json['action'] as String),
  status: json['status'] as String?,
  reportsHandled: (json['reportsHandled'] as num).toInt(),
);

Map<String, dynamic> _$ModerationActionResultDtoToJson(
  ModerationActionResultDto instance,
) => <String, dynamic>{
  'targetType': instance.targetType.toJson(),
  'targetId': instance.targetId,
  'action': instance.action.toJson(),
  'status': ?instance.status,
  'reportsHandled': instance.reportsHandled,
};
