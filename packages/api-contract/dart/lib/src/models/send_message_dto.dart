// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'send_message_type.dart';

part 'send_message_dto.g.dart';

@JsonSerializable()
class SendMessageDto {
  const SendMessageDto({
    required this.clientMessageId,
    this.fileName,
    this.body,
    this.fileId,
    this.durationMs,
    this.waveform,
    this.type = SendMessageType.text,
  });

  factory SendMessageDto.fromJson(Map<String, Object?> json) =>
      _$SendMessageDtoFromJson(json);

  /// App-generated id (UUID), idempotency key.
  final String clientMessageId;
  final SendMessageType type;

  /// OQ-047: the attachment's original file name (shown on its card).
  final String? fileName;

  /// Text of a text message; ignored for voice.
  final String? body;

  /// Voice: a clean `chat_voice` file; attachment: a clean `chat_attachment` file of the sender.
  final String? fileId;
  final int? durationMs;

  /// Up to 100 bars, each 0–100.
  final List<int>? waveform;

  Map<String, Object?> toJson() => _$SendMessageDtoToJson(this);
}
