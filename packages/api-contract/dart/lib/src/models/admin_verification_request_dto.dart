// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_attorney_summary_dto.dart';
import 'admin_check_dto.dart';
import 'admin_document_dto.dart';
import 'admin_license_dto.dart';
import 'admin_request_history_item_dto.dart';
import 'verification_provider.dart';
import 'verification_request_status.dart';

part 'admin_verification_request_dto.g.dart';

@JsonSerializable()
class AdminVerificationRequestDto {
  const AdminVerificationRequestDto({
    required this.id,
    required this.status,
    required this.provider,
    required this.submittedAt,
    required this.reviewedAt,
    required this.reviewerId,
    required this.applicantComment,
    required this.infoRequestMessage,
    required this.rejectionCode,
    required this.rejectionReason,
    required this.adminNote,
    required this.createdAt,
    required this.attorney,
    required this.licenses,
    required this.documents,
    required this.checks,
    required this.history,
  });

  factory AdminVerificationRequestDto.fromJson(Map<String, Object?> json) =>
      _$AdminVerificationRequestDtoFromJson(json);

  final String id;
  final VerificationRequestStatus status;
  final VerificationProvider provider;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;
  final String? reviewerId;
  final String? applicantComment;
  final String? infoRequestMessage;
  final String? rejectionCode;
  final String? rejectionReason;
  final String? adminNote;
  final DateTime createdAt;
  final AdminAttorneySummaryDto attorney;
  final List<AdminLicenseDto> licenses;
  final List<AdminDocumentDto> documents;
  final List<AdminCheckDto> checks;

  /// The attorney's other requests, newest first.
  final List<AdminRequestHistoryItemDto> history;

  Map<String, Object?> toJson() => _$AdminVerificationRequestDtoToJson(this);
}
