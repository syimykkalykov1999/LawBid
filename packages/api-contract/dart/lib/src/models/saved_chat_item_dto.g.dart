// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'saved_chat_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SavedChatItemDto _$SavedChatItemDtoFromJson(Map<String, dynamic> json) =>
    SavedChatItemDto(
      savedAt: DateTime.parse(json['savedAt'] as String),
      message: MessageDto.fromJson(json['message'] as Map<String, dynamic>),
      chat: ConversationDto.fromJson(json['chat'] as Map<String, dynamic>),
      mine: json['mine'] as bool,
    );

Map<String, dynamic> _$SavedChatItemDtoToJson(SavedChatItemDto instance) =>
    <String, dynamic>{
      'savedAt': instance.savedAt.toIso8601String(),
      'message': instance.message.toJson(),
      'chat': instance.chat.toJson(),
      'mine': instance.mine,
    };
