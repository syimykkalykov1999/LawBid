// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'review_report_dto.dart';

part 'review_report_envelope.g.dart';

@JsonSerializable()
class ReviewReportEnvelope {
  const ReviewReportEnvelope({required this.data, this.meta});

  factory ReviewReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReviewReportEnvelopeFromJson(json);

  final ReviewReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReviewReportEnvelopeToJson(this);
}
