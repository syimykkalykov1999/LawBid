// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'report_reason.dart';

part 'report_review_dto.g.dart';

@JsonSerializable()
class ReportReviewDto {
  const ReportReviewDto({required this.reason, this.note});

  factory ReportReviewDto.fromJson(Map<String, Object?> json) =>
      _$ReportReviewDtoFromJson(json);

  final ReportReason reason;
  final String? note;

  Map<String, Object?> toJson() => _$ReportReviewDtoToJson(this);
}
