// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'send_message_dto.g.dart';

@JsonSerializable()
class SendMessageDto {
  const SendMessageDto({required this.clientMessageId, required this.body});

  factory SendMessageDto.fromJson(Map<String, Object?> json) =>
      _$SendMessageDtoFromJson(json);

  /// App-generated id (UUID), idempotency key.
  final String clientMessageId;
  final String body;

  Map<String, Object?> toJson() => _$SendMessageDtoToJson(this);
}
