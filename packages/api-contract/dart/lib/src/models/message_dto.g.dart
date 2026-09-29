// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'message_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MessageDto _$MessageDtoFromJson(Map<String, dynamic> json) => MessageDto(
  id: json['id'] as String,
  conversationId: json['conversationId'] as String,
  type: MessageDtoType.fromJson(json['type'] as String),
  body: json['body'] as String,
  contactMasked: json['contactMasked'] as bool,
  createdAt: DateTime.parse(json['createdAt'] as String),
  senderId: json['senderId'] as String?,
  clientMessageId: json['clientMessageId'] as String?,
);

Map<String, dynamic> _$MessageDtoToJson(MessageDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'conversationId': instance.conversationId,
      'senderId': ?instance.senderId,
      'type': instance.type.toJson(),
      'body': instance.body,
      'contactMasked': instance.contactMasked,
      'clientMessageId': ?instance.clientMessageId,
      'createdAt': instance.createdAt.toIso8601String(),
    };
