// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_e2ee_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConversationE2eeDto _$ConversationE2eeDtoFromJson(
  Map<String, dynamic> json,
) => ConversationE2eeDto(
  state: ConversationE2eeState.fromJson(json['state'] as String),
  devices: (json['devices'] as List<dynamic>)
      .map((e) => MlsGroupMemberDeviceDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  removeDevices: (json['removeDevices'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  reason: json['reason'] == null
      ? null
      : ConversationE2eeOffReason.fromJson(json['reason'] as String),
  groupId: json['groupId'] as String?,
  epoch: json['epoch'] as num?,
  since: json['since'] == null ? null : DateTime.parse(json['since'] as String),
);

Map<String, dynamic> _$ConversationE2eeDtoToJson(
  ConversationE2eeDto instance,
) => <String, dynamic>{
  'state': instance.state.toJson(),
  'reason': ?instance.reason?.toJson(),
  'groupId': ?instance.groupId,
  'epoch': ?instance.epoch,
  'since': ?instance.since?.toIso8601String(),
  'devices': instance.devices.map((e) => e.toJson()).toList(),
  'removeDevices': instance.removeDevices,
};
