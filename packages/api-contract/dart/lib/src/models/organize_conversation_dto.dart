// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'organize_conversation_dto_folder.dart';

part 'organize_conversation_dto.g.dart';

@JsonSerializable()
class OrganizeConversationDto {
  const OrganizeConversationDto({
    this.folder,
    this.waiting,
    this.note,
    this.pinned,
    this.hidden,
  });

  factory OrganizeConversationDto.fromJson(Map<String, Object?> json) =>
      _$OrganizeConversationDtoFromJson(json);

  /// auto = case chats Primary, direct chats General.
  final OrganizeConversationDtoFolder? folder;

  /// "Waiting for my answer" on / off.
  final bool? waiting;

  /// A note pinned on the chat; "" or null clears it.
  final String? note;

  /// Pinned to the top of my list.
  final bool? pinned;

  /// Remove the chat from my list only; a new message revives it.
  final bool? hidden;

  Map<String, Object?> toJson() => _$OrganizeConversationDtoToJson(this);
}
