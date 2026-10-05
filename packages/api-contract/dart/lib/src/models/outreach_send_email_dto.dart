// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'outreach_send_email_dto.g.dart';

@JsonSerializable()
class OutreachSendEmailDto {
  const OutreachSendEmailDto({required this.templateId});

  factory OutreachSendEmailDto.fromJson(Map<String, Object?> json) =>
      _$OutreachSendEmailDtoFromJson(json);

  final String templateId;

  Map<String, Object?> toJson() => _$OutreachSendEmailDtoToJson(this);
}
