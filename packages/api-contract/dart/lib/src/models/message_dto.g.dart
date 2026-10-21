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
  revoked: json['revoked'] as bool,
  forwarded: json['forwarded'] as bool,
  reactions: (json['reactions'] as List<dynamic>)
      .map((e) => ReactionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  pinned: json['pinned'] as bool,
  senderId: json['senderId'] as String?,
  sentByAssistant: json['sentByAssistant'] as String?,
  gift: json['gift'] == null
      ? null
      : GiftSendDto.fromJson(json['gift'] as Map<String, dynamic>),
  contact: json['contact'] == null
      ? null
      : ContactCardDto.fromJson(json['contact'] as Map<String, dynamic>),
  post: json['post'] == null
      ? null
      : SharedPostCardDto.fromJson(json['post'] as Map<String, dynamic>),
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
  expiresAt: json['expiresAt'] == null
      ? null
      : DateTime.parse(json['expiresAt'] as String),
  editedAt: json['editedAt'] == null
      ? null
      : DateTime.parse(json['editedAt'] as String),
  forwardedFrom: json['forwardedFrom'] as String?,
  replyTo: json['replyTo'] == null
      ? null
      : ReplyPreviewDto.fromJson(json['replyTo'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MessageDtoToJson(MessageDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'conversationId': instance.conversationId,
      'senderId': ?instance.senderId,
      'sentByAssistant': ?instance.sentByAssistant,
      'type': instance.type.toJson(),
      'gift': ?instance.gift?.toJson(),
      'contact': ?instance.contact?.toJson(),
      'post': ?instance.post?.toJson(),
      'sticker': ?instance.sticker?.toJson(),
      'voice': ?instance.voice?.toJson(),
      'attachment': ?instance.attachment?.toJson(),
      'call': ?instance.call?.toJson(),
      'body': instance.body,
      'contactMasked': instance.contactMasked,
      'clientMessageId': ?instance.clientMessageId,
      'createdAt': instance.createdAt.toIso8601String(),
      'expiresAt': ?instance.expiresAt?.toIso8601String(),
      'editedAt': ?instance.editedAt?.toIso8601String(),
      'revoked': instance.revoked,
      'forwarded': instance.forwarded,
      'forwardedFrom': ?instance.forwardedFrom,
      'replyTo': ?instance.replyTo?.toJson(),
      'reactions': instance.reactions.map((e) => e.toJson()).toList(),
      'pinned': instance.pinned,
    };
