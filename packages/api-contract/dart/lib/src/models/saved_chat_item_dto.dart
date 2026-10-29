// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'conversation_dto.dart';
import 'message_dto.dart';

part 'saved_chat_item_dto.g.dart';

@JsonSerializable()
class SavedChatItemDto {
  const SavedChatItemDto({
    required this.savedAt,
    required this.message,
    required this.chat,
    required this.mine,
  });
  
  factory SavedChatItemDto.fromJson(Map<String, Object?> json) => _$SavedChatItemDtoFromJson(json);
  
  final DateTime savedAt;
  final MessageDto message;

  /// The chat the message is in (for the title and the opener).
  final ConversationDto chat;

  /// The person wrote it.
  final bool mine;

  Map<String, Object?> toJson() => _$SavedChatItemDtoToJson(this);
}
