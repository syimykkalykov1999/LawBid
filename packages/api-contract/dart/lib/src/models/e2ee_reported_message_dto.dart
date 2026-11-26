// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'e2ee_reported_message_dto.g.dart';

@JsonSerializable()
class E2eeReportedMessageDto {
  const E2eeReportedMessageDto({
    required this.messageId,
    required this.plaintext,
  });

  factory E2eeReportedMessageDto.fromJson(Map<String, Object?> json) =>
      _$E2eeReportedMessageDtoFromJson(json);

  final String messageId;

  /// Base64 of the message plaintext exactly as this device decrypted it (it holds the franking key `k`).
  final String plaintext;

  Map<String, Object?> toJson() => _$E2eeReportedMessageDtoToJson(this);
}
