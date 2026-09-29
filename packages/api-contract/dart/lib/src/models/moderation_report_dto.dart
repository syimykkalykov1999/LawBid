// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'moderation_report_dto.g.dart';

@JsonSerializable()
class ModerationReportDto {
  const ModerationReportDto({
    required this.id,
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
  final String reporterId;
  final String reason;
  final String? note;
  final String status;
  final DateTime createdAt;
  final DateTime? handledAt;

  Map<String, Object?> toJson() => _$ModerationReportDtoToJson(this);
}
