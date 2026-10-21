// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_channel_post_action_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminChannelPostActionDto _$AdminChannelPostActionDtoFromJson(
  Map<String, dynamic> json,
) => AdminChannelPostActionDto(
  action: AdminChannelPostActionDtoAction.fromJson(json['action'] as String),
  reason: json['reason'] as String? ?? '',
);

Map<String, dynamic> _$AdminChannelPostActionDtoToJson(
  AdminChannelPostActionDto instance,
) => <String, dynamic>{
  'action': instance.action.toJson(),
  'reason': instance.reason,
};
