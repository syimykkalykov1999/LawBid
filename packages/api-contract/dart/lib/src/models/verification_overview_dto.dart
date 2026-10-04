// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'verification_request_dto.dart';
import 'verification_status.dart';

part 'verification_overview_dto.g.dart';

@JsonSerializable()
class VerificationOverviewDto {
  const VerificationOverviewDto({
    required this.verificationStatus,
    required this.identityRequired,
    required this.barDocumentRequired,
    required this.submissionsLast30Days,
    required this.maxSubmissions30Days,
    this.request,
  });

  factory VerificationOverviewDto.fromJson(Map<String, Object?> json) =>
      _$VerificationOverviewDtoFromJson(json);

  final VerificationStatus verificationStatus;

  /// The latest request, or null if none yet.
  final VerificationRequestDto? request;

  /// Identity document and selfie are required: off by default (owner 2026-10-04, setting verification.require_identity); always on for a verified attorney confirming a new name.
  final bool identityRequired;

  /// A photo of the bar card is required per license (setting verification.require_bar_document, off by default).
  final bool barDocumentRequired;
  final int submissionsLast30Days;
  final int maxSubmissions30Days;

  Map<String, Object?> toJson() => _$VerificationOverviewDtoToJson(this);
}
