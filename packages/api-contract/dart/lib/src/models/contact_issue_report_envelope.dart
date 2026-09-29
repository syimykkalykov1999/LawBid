// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_issue_report_dto.dart';
import 'response_meta_dto.dart';

part 'contact_issue_report_envelope.g.dart';

@JsonSerializable()
class ContactIssueReportEnvelope {
  const ContactIssueReportEnvelope({required this.data, this.meta});

  factory ContactIssueReportEnvelope.fromJson(Map<String, Object?> json) =>
      _$ContactIssueReportEnvelopeFromJson(json);

  final ContactIssueReportDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ContactIssueReportEnvelopeToJson(this);
}
