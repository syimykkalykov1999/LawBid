// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'chat_folder_counts_dto.g.dart';

@JsonSerializable()
class ChatFolderCountsDto {
  const ChatFolderCountsDto({
    required this.waiting,
    required this.requests,
    required this.cases,
    required this.archived,
  });

  factory ChatFolderCountsDto.fromJson(Map<String, Object?> json) =>
      _$ChatFolderCountsDtoFromJson(json);

  final num waiting;
  final num requests;

  /// Owner 2026-10-21: case chats whose last message is the other side’s (waiting for my answer).
  final num cases;

  /// Owner 2026-10-21: chats in my Archive (groups and channels have their own archive on the Channels screen).
  final num archived;

  Map<String, Object?> toJson() => _$ChatFolderCountsDtoToJson(this);
}
