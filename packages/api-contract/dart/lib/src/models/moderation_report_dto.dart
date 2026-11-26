// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'moderation_e2ee_evidence_dto.dart';

part 'moderation_report_dto.g.dart';

@JsonSerializable()
class ModerationReportDto {
  const ModerationReportDto({
    required this.id,
    required this.e2eeEvidence,
    required this.reporterId,
    required this.reason,
    required this.note,
    required this.status,
    required this.createdAt,
    required this.handledAt,
  });

  factory ModerationReportDto.fromJson(Map<String, Object?> json) =>
      _$ModerationReportDtoFromJson(json);

  final String id;

  /// Item 25: messages handed over from an encrypted chat.
  final List<ModerationE2eeEvidenceDto> e2eeEvidence;
  final String reporterId;
  final String reason;
  final String? note;
  final String status;
  final DateTime createdAt;
  final DateTime? handledAt;

  Map<String, Object?> toJson() => _$ModerationReportDtoToJson(this);
}
