// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'private_message_item_dto.dart';

part 'private_messages_page_dto.g.dart';

@JsonSerializable()
class PrivateMessagesPageDto {
  const PrivateMessagesPageDto({
    required this.conversationId,
    required this.attorneyId,
    required this.clientId,
    required this.items,
    required this.nextCursor,
  });

  factory PrivateMessagesPageDto.fromJson(Map<String, Object?> json) =>
      _$PrivateMessagesPageDtoFromJson(json);

  final String conversationId;
  final String attorneyId;
  final String clientId;
  final List<PrivateMessageItemDto> items;
  final String? nextCursor;

  Map<String, Object?> toJson() => _$PrivateMessagesPageDtoToJson(this);
}
