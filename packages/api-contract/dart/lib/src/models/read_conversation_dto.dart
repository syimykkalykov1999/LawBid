// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'read_conversation_dto.g.dart';

@JsonSerializable()
class ReadConversationDto {
  const ReadConversationDto({required this.lastReadMessageId});

  factory ReadConversationDto.fromJson(Map<String, Object?> json) =>
      _$ReadConversationDtoFromJson(json);

  final String lastReadMessageId;

  Map<String, Object?> toJson() => _$ReadConversationDtoToJson(this);
}
