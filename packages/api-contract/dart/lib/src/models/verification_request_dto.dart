// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'own_verification_document_dto.dart';
import 'verification_license_dto.dart';
import 'verification_request_status.dart';

part 'verification_request_dto.g.dart';

@JsonSerializable()
class VerificationRequestDto {
  const VerificationRequestDto({
    required this.id,
    required this.status,
    required this.applicantComment,
    required this.infoRequestMessage,
    required this.rejectionCode,
    required this.rejectionReason,
    required this.submittedAt,
    required this.reviewedAt,
    required this.createdAt,
    required this.licenses,
    required this.documents,
  });

  factory VerificationRequestDto.fromJson(Map<String, Object?> json) =>
      _$VerificationRequestDtoFromJson(json);

  final String id;
  final VerificationRequestStatus status;
  final String? applicantComment;

  /// The verifier message of `needs_more_info`.
  final String? infoRequestMessage;
  final String? rejectionCode;
  final String? rejectionReason;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;
  final DateTime createdAt;

  /// All of the attorney's licenses with their status.
  final List<VerificationLicenseDto> licenses;
  final List<OwnVerificationDocumentDto> documents;

  Map<String, Object?> toJson() => _$VerificationRequestDtoToJson(this);
}
