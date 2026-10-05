// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'outreach_send_email_result_dto.g.dart';

@JsonSerializable()
class OutreachSendEmailResultDto {
  const OutreachSendEmailResultDto({
    required this.subject,
    required this.remainingToday,
  });

  factory OutreachSendEmailResultDto.fromJson(Map<String, Object?> json) =>
      _$OutreachSendEmailResultDtoFromJson(json);

  final String subject;

  /// Emails left in this employee's daily budget.
  final num remainingToday;

  Map<String, Object?> toJson() => _$OutreachSendEmailResultDtoToJson(this);
}
