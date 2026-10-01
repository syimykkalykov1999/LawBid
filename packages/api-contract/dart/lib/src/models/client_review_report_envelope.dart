// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_review_report_dto.dart';
import 'response_meta_dto.dart';

part 'client_review_report_envelope.g.dart';

@JsonSerializable()
class ClientReviewReportEnvelope {
  const ClientReviewReportEnvelope({required this.data, this.meta});

  factory ClientReviewReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$ClientReviewReportEnvelopeFromJson(json);

  final ClientReviewReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ClientReviewReportEnvelopeToJson(this);
}
