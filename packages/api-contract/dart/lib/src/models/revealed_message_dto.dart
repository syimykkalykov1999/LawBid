// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'revealed_message_dto.g.dart';

@JsonSerializable()
class RevealedMessageDto {
  const RevealedMessageDto({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.createdAt,
    required this.body,
  });

  factory RevealedMessageDto.fromJson(Map<String, Object?> json) =>
      _$RevealedMessageDtoFromJson(json);

  final String id;
  final String conversationId;
  final String? senderId;
  final DateTime createdAt;

  /// The original text as sent.
  final String body;

  Map<String, Object?> toJson() => _$RevealedMessageDtoToJson(this);
}
