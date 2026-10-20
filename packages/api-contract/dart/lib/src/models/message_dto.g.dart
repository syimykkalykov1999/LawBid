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
  sentByAssistant: json['sentByAssistant'] as String?,
  gift: json['gift'] == null
      ? null
      : GiftSendDto.fromJson(json['gift'] as Map<String, dynamic>),
  sticker: json['sticker'] == null
      ? null
      : StickerDto.fromJson(json['sticker'] as Map<String, dynamic>),
  voice: json['voice'] == null
      ? null
      : VoiceNoteDto.fromJson(json['voice'] as Map<String, dynamic>),
  attachment: json['attachment'] == null
      ? null
      : ChatAttachmentDto.fromJson(json['attachment'] as Map<String, dynamic>),
  call: json['call'] == null
      ? null
      : CallLogDto.fromJson(json['call'] as Map<String, dynamic>),
  clientMessageId: json['clientMessageId'] as String?,
);

Map<String, dynamic> _$MessageDtoToJson(MessageDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'conversationId': instance.conversationId,
      'senderId': ?instance.senderId,
      'sentByAssistant': ?instance.sentByAssistant,
      'type': instance.type.toJson(),
      'gift': ?instance.gift?.toJson(),
      'sticker': ?instance.sticker?.toJson(),
      'voice': ?instance.voice?.toJson(),
      'attachment': ?instance.attachment?.toJson(),
      'call': ?instance.call?.toJson(),
      'body': instance.body,
      'contactMasked': instance.contactMasked,
      'clientMessageId': ?instance.clientMessageId,
      'createdAt': instance.createdAt.toIso8601String(),
    };
