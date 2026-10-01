// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'chat_folder_counts_dto.g.dart';

@JsonSerializable()
class ChatFolderCountsDto {
  const ChatFolderCountsDto({required this.waiting, required this.requests});

  factory ChatFolderCountsDto.fromJson(Map<String, Object?> json) =>
      _$ChatFolderCountsDtoFromJson(json);

  final num waiting;
  final num requests;

  Map<String, Object?> toJson() => _$ChatFolderCountsDtoToJson(this);
}
