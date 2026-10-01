// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'client_review_report_dto.g.dart';

@JsonSerializable()
class ClientReviewReportDto {
  const ClientReviewReportDto({required this.id, required this.status});

  factory ClientReviewReportDto.fromJson(Map<String, Object?> json) =>
      _$ClientReviewReportDtoFromJson(json);

  final String id;
  final String status;

  Map<String, Object?> toJson() => _$ClientReviewReportDtoToJson(this);
}
