// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'push_action_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PushActionDto _$PushActionDtoFromJson(Map<String, dynamic> json) =>
    PushActionDto(
      token: json['token'] as String,
      fcmToken: json['fcmToken'] as String,
      action: PushActionDtoAction.fromJson(json['action'] as String),
      messageId: json['messageId'] as String?,
      text: json['text'] as String?,
      clientMessageId: json['clientMessageId'] as String?,
    );

Map<String, dynamic> _$PushActionDtoToJson(PushActionDto instance) =>
    <String, dynamic>{
      'token': instance.token,
      'fcmToken': instance.fcmToken,
      'action': instance.action.toJson(),
      'messageId': ?instance.messageId,
      'text': ?instance.text,
      'clientMessageId': ?instance.clientMessageId,
    };
