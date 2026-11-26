// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'e2ee_report_reason.dart';
import 'e2ee_reported_message_dto.dart';

part 'e2ee_report_dto.g.dart';

@JsonSerializable()
class E2eeReportDto {
  const E2eeReportDto({
    required this.reportedUserId,
    required this.reason,
    required this.messages,
    this.note,
  });

  factory E2eeReportDto.fromJson(Map<String, Object?> json) =>
      _$E2eeReportDtoFromJson(json);

  /// The person reported.
  final String reportedUserId;
  final E2eeReportReason reason;
  final String? note;

  /// The reported person's last messages (at most chat.e2ee_report_messages), as WhatsApp sends them.
  final List<E2eeReportedMessageDto> messages;

  Map<String, Object?> toJson() => _$E2eeReportDtoToJson(this);
}
