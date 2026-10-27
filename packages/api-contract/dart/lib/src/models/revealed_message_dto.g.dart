// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'revealed_message_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RevealedMessageDto _$RevealedMessageDtoFromJson(Map<String, dynamic> json) =>
    RevealedMessageDto(
      id: json['id'] as String,
      conversationId: json['conversationId'] as String,
      senderId: json['senderId'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      body: json['body'] as String,
    );

Map<String, dynamic> _$RevealedMessageDtoToJson(RevealedMessageDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'conversationId': instance.conversationId,
      'senderId': ?instance.senderId,
      'createdAt': instance.createdAt.toIso8601String(),
      'body': instance.body,
    };
