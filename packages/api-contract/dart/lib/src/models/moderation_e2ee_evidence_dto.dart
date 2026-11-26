// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'moderation_e2ee_evidence_dto.g.dart';

@JsonSerializable()
class ModerationE2eeEvidenceDto {
  const ModerationE2eeEvidenceDto({
    required this.messageId,
    required this.text,
    required this.verified,
    required this.sentAt,
  });

  factory ModerationE2eeEvidenceDto.fromJson(Map<String, Object?> json) =>
      _$ModerationE2eeEvidenceDtoFromJson(json);

  final String messageId;
  final String text;
  final bool verified;
  final DateTime sentAt;

  Map<String, Object?> toJson() => _$ModerationE2eeEvidenceDtoToJson(this);
}
