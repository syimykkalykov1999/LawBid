// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'report_reason.dart';
import 'report_status.dart';

part 'review_report_dto.g.dart';

@JsonSerializable()
class ReviewReportDto {
  const ReviewReportDto({
    required this.id,
    required this.reviewId,
    required this.reason,
    required this.status,
    required this.createdAt,
  });

  factory ReviewReportDto.fromJson(Map<String, Object?> json) =>
      _$ReviewReportDtoFromJson(json);

  final String id;
  final String reviewId;
  final ReportReason reason;
  final ReportStatus status;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$ReviewReportDtoToJson(this);
}
