// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_action_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationActionDto _$ModerationActionDtoFromJson(Map<String, dynamic> json) =>
    ModerationActionDto(
      action: ModerationActionDtoAction.fromJson(json['action'] as String),
      reason: json['reason'] as String,
    );

Map<String, dynamic> _$ModerationActionDtoToJson(
  ModerationActionDto instance,
) => <String, dynamic>{
  'action': instance.action.toJson(),
  'reason': instance.reason,
};
