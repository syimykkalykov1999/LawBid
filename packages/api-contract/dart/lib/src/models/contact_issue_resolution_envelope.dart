// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_issue_resolution_dto.dart';
import 'response_meta_dto.dart';

part 'contact_issue_resolution_envelope.g.dart';

@JsonSerializable()
class ContactIssueResolutionEnvelope {
  const ContactIssueResolutionEnvelope({required this.data, this.meta});

  factory ContactIssueResolutionEnvelope.fromJson(Map<String, Object?> json) =>
      _$ContactIssueResolutionEnvelopeFromJson(json);

  final ContactIssueResolutionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ContactIssueResolutionEnvelopeToJson(this);
}
